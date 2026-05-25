import { describe, expect, it } from "vitest";
import { encodeCursor, parseCursor } from "../src/lib/cursor";
import { clampCount } from "../src/lib/vote";
import { heartsAwarded, parseMentionIds, sanitizeCommentText } from "../src/lib/comments";
import { bucketStart } from "../src/lib/season";
import { cumulativeBuckets, parseIds, resample, topIdsByMetric } from "../src/lib/series";
import { buildLlmsTxt } from "../src/lib/llms";
import { groupDecisionsByMinute } from "../src/lib/decisions";
import { mergeContestants, missingAgentsForSync } from "../src/lib/contestants";
import { fetchUpstreamWithDeps, upstreamCacheKey, validateUpstreamBaseUrl, UPSTREAM_FETCH_TIMEOUT_MS, UPSTREAM_TTL_MS } from "../src/lib/upstream";
import { uniqueIncomingDecisionIds } from "../src/lib/sediment";
import { generateApiKey, hashKey, verifyKey } from "../src/lib/keys";
import { newId } from "../src/lib/ids";
import { publicOriginFromHeaders } from "../src/lib/season";

describe("contract helpers", () => {
  it("clamps vote count to [1,25]", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(7)).toBe(7);
    expect(clampCount(99)).toBe(25);
  });

  it("sanitizes comments and awards distinct mention hearts", () => {
    expect(sanitizeCommentText("<img src=x onerror=1>hello\u0000".repeat(20))).not.toContain("<");
    expect(sanitizeCommentText("x".repeat(250))).toHaveLength(200);
    expect(parseMentionIds("@claude @claude @gpt")).toEqual(["claude", "gpt"]);
    expect(heartsAwarded(["claude", "claude", "gpt"])).toEqual({ claude: 10, gpt: 10 });
  });

  it("uses minute vote buckets and monotonic cumulative series", () => {
    expect(bucketStart(123456)).toBe(120000);
    const series = cumulativeBuckets([
      { contestantId: "a", bucketStart: 1, count: 2 },
      { contestantId: "a", bucketStart: 2, count: 3 },
    ]);
    expect(series.a).toEqual([{ t: 1, count: 2 }, { t: 2, count: 5 }]);
    expect(resample(Array.from({ length: 300 }, (_, i) => i))).toHaveLength(100);
    expect(parseIds("a,b,a")).toEqual(["a", "b"]);
    expect(topIdsByMetric([{ id: "a", n: 1 }, { id: "b", n: 3 }], (x) => x.id, (x) => x.n, 1)).toEqual(["b"]);
  });

  it("round-trips decision cursors and renders llms docs", () => {
    expect(parseCursor(encodeCursor(177000, 42))).toEqual({ createdAt: 177000, id: 42 });
    const grouped = groupDecisionsByMinute([
      decision(1, 120500),
      decision(2, 120100),
      decision(3, 60100),
    ], 2);
    expect(grouped.minutes.map((m) => [m.minute, m.items.map((i) => i.id)])).toEqual([[120000, [1, 2]], [60000, [3]]]);
    expect(uniqueIncomingDecisionIds([{ id: 1, agentId: "a", symbol: "A", action: "buy" }, { id: "1", agentId: "a", symbol: "A", action: "buy" }])).toEqual([1]);
    const doc = buildLlmsTxt("https://arena.example/");
    expect(doc).toContain("Base URL: https://arena.example");
    expect(doc).toContain("POST https://arena.example/api/public/manage/contestants/sync");
    expect(doc).toContain("PATCH https://arena.example/api/public/manage/competition");
    expect(doc).toContain("/api/comments");
  });

  it("merges contestant overrides by equity rank and sync only inserts missing agents", () => {
    const rows = mergeContestants(
      [
        { id: "claude", name: "Claude", account: { equity: "101" }, metrics: { returnPct: "1", totalPnl: "1" } },
        { id: "gpt", name: "GPT", account: { equity: "120" }, metrics: { returnPct: "2" } },
      ],
      [{ id: "claude", displayName: "Edited Claude", tagline: "Manual", accentColor: "#fff", sortOrder: 9, hidden: 0 }],
      new Map([["claude", 10]])
    );
    expect(rows.map((row) => [row.id, row.rank])).toEqual([["gpt", 1], ["claude", 2]]);
    expect(rows[1].displayName).toBe("Edited Claude");
    expect(missingAgentsForSync([{ id: "claude" }, { id: "kimi" }], new Set(["claude"]))).toEqual([{ id: "kimi" }]);
  });

  it("uses D1 upstream cache freshness and stale-while-revalidate", async () => {
    let calls = 0;
    const fresh = await fetchUpstreamWithDeps<{ ok: boolean }>({
      resource: "agents",
      upstreamBaseUrl: "https://up.example",
      now: 1000,
      cached: { payload: "{\"ok\":true}", fetchedAt: 1000 - UPSTREAM_TTL_MS + 1 },
      fetchJson: async () => { calls++; return { ok: false }; },
      save: async () => {},
    });
    expect(fresh).toEqual({ ok: true });
    expect(calls).toBe(0);

    const saved: Array<{ payload: unknown; fetchedAt: number }> = [];
    const background: Promise<unknown>[] = [];
    const stale = await fetchUpstreamWithDeps({
      resource: "agents",
      upstreamBaseUrl: "https://up.example/",
      now: 100000,
      cached: { payload: "{\"ok\":false}", fetchedAt: 0 },
      fetchJson: async (url) => { calls++; expect(url).toBe("https://up.example/agents"); return { ok: true }; },
      save: async (payload, fetchedAt) => { saved.push({ payload, fetchedAt }); },
      runInBackground: (promise) => { background.push(promise); },
    });
    expect(stale).toEqual({ ok: false });
    await Promise.all(background);
    expect(saved).toEqual([{ payload: { ok: true }, fetchedAt: 100000 }]);

    const coldFailure = await fetchUpstreamWithDeps({
      resource: "agents",
      upstreamBaseUrl: "https://up.example",
      now: 1000,
      cached: null,
      fetchJson: async () => { throw new Error("down"); },
      save: async () => {},
    });
    expect(coldFailure).toBeNull();
    expect(upstreamCacheKey("https://up.example/api/public", "agents")).toBe("https://up.example/api/public::agents");
    expect(UPSTREAM_FETCH_TIMEOUT_MS).toBe(22000);
  });

  it("rejects SSRF-prone upstream base URLs before fetch", async () => {
    const blocked = [
      "file:///etc/passwd",
      "https://user:pass@example.com/api",
      "https://example.com/api#frag",
      "http://localhost:8787/api",
      "http://127.0.0.1/api",
      "http://0.0.0.0/api",
      "http://10.0.0.1/api",
      "http://172.16.0.1/api",
      "http://192.168.1.1/api",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/api",
      "http://[fe80::1]/api",
      "http://[fc00::1]/api",
    ];
    for (const url of blocked) {
      expect(validateUpstreamBaseUrl(url).ok, url).toBe(false);
    }
    expect(validateUpstreamBaseUrl("https://up.example/api/public/")).toEqual({ ok: true, url: "https://up.example/api/public" });

    let calls = 0;
    const result = await fetchUpstreamWithDeps({
      resource: "agents",
      upstreamBaseUrl: "http://169.254.169.254/latest/meta-data",
      now: 100000,
      cached: { payload: "{\"ok\":\"cached\"}", fetchedAt: 0 },
      fetchJson: async () => { calls++; return { ok: true }; },
      save: async () => {},
    });
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("generates and verifies API keys, ids, and forwarded public origins", async () => {
    const key = await generateApiKey();
    expect(key.plaintext.startsWith("esk_")).toBe(true);
    expect(key.prefix).toBe(key.plaintext.slice(0, 12));
    expect(await verifyKey(key.plaintext, key.hash)).toBe(true);
    expect(await verifyKey("esk_wrong", key.hash)).toBe(false);
    expect(await hashKey("same")).toBe(await hashKey("same"));
    expect(newId()).toMatch(/[0-9a-f-]{36}/);

    const headers = new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "arena.example" });
    expect(publicOriginFromHeaders(headers, "http://internal/api")).toBe("https://arena.example");
    expect(publicOriginFromHeaders(new Headers(), "http://internal/api")).toBe("http://internal");
  });
});

function decision(id: number, createdAt: number) {
  return {
    id,
    contestantId: "claude",
    symbol: "AAPL",
    action: "buy",
    qty: 1,
    price: 2,
    confidence: 0.7,
    reasoning: "",
    justification: "",
    chainOfThought: "",
    timestamp: createdAt,
    createdAt,
  };
}
