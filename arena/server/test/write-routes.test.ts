import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const queue: unknown[][] = [];
const batchCalls: unknown[][] = [];
const insertValues: unknown[] = [];

function queuedQuery() {
  const rows = queue.shift() ?? [];
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const db = {
  select: () => queuedQuery(),
  insert: () => ({
    values: (value: unknown) => {
      insertValues.push(value);
      return {
      onConflictDoUpdate: () => ({ kind: "upsert" }),
      onConflictDoNothing: () => ({ kind: "insert-ignore" }),
      returning: () => Promise.resolve([{ id: 77 }]),
    };
    },
  }),
  batch: async (items: unknown[]) => {
    batchCalls.push(items);
    return [[{ id: 77 }], ...items.slice(1).map(() => [])];
  },
};

vi.mock("edgespark", () => ({
  db,
  ctx: { environment: "dev", runInBackground: () => undefined },
  vars: { get: () => null },
  secret: { get: () => null },
}), { virtual: true });

vi.mock("edgespark/http", () => ({
  auth: { user: { id: "user-1", email: "u@example.com", name: "User", image: "https://img.test/u.png" } },
}), { virtual: true });

function competition(status = "live", votingEnabled = 1, commentsEnabled = 1) {
  return {
    id: "current",
    title: "Live Trading Arena",
    status,
    startsAt: null,
    endsAt: null,
    upstreamBaseUrl: "https://arena.test/api/public/mock",
    votingEnabled,
    commentsEnabled,
    activeSeasonId: "season-1",
    updatedAt: 1,
  };
}

describe("login-gated writes with mocked EdgeSpark runtime", () => {
  beforeEach(() => {
    queue.splice(0);
    batchCalls.splice(0);
    insertValues.splice(0);
  });

  it("accepts live votes, clamps count, and rejects hidden or non-live voting", async () => {
    const { voteWriteRoutes } = await import("../src/routes/vote");
    const app = new Hono().route("/api", voteWriteRoutes);

    queue.push([competition()], [{ id: "claude", hidden: 0 }], [{ seasonId: "season-1", contestantId: "claude", total: 25 }]);
    let res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "claude", count: 999 }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true, total: 25 });

    queue.push([competition("ended")]);
    res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "claude" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(403);

    queue.push([competition()], []);
    res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "hidden" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("allows one draft vote per user and carries it into totals", async () => {
    const { voteWriteRoutes } = await import("../src/routes/vote");
    const app = new Hono().route("/api", voteWriteRoutes);

    queue.push([competition("draft")], [{ id: "gemini", hidden: 0 }], [], [{ seasonId: "season-1", contestantId: "gemini", total: 1 }]);
    let res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "gemini", count: 25 }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true, total: 1 });

    queue.push([competition("draft")], [{ id: "gemini", hidden: 0 }], [{ seasonId: "season-1", userId: "user-1" }]);
    res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "gemini" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "already_voted" } });
  });

  it("creates comments and awards +10 once per distinct valid mention", async () => {
    const { commentsWriteRoutes } = await import("../src/routes/comments");
    const app = new Hono().route("/api", commentsWriteRoutes);

    queue.push([competition()], [{ id: "claude" }, { id: "gpt" }]);
    const res = await app.request("https://arena.test/api/comments", {
      method: "POST",
      body: JSON.stringify({ text: "<b>go</b> @claude @claude @gpt @missing" }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true, id: 77, heartsAwarded: { claude: 10, gpt: 10 } });
    expect(batchCalls[0]).toHaveLength(7);

    queue.push([competition("ended")]);
    const disabled = await app.request("https://arena.test/api/comments", {
      method: "POST",
      body: JSON.stringify({ text: "@claude" }),
      headers: { "content-type": "application/json" },
    });
    expect(disabled.status).toBe(403);
  });

  it("stores draft comments without awarding mention hearts", async () => {
    const { commentsWriteRoutes } = await import("../src/routes/comments");
    const app = new Hono().route("/api", commentsWriteRoutes);

    queue.push([competition("draft")], [{ id: "gemini" }]);
    const res = await app.request("https://arena.test/api/comments", {
      method: "POST",
      body: JSON.stringify({ text: "@gemini warmup" }),
      headers: { "content-type": "application/json" },
    });

    expect(await res.json()).toEqual({ ok: true, id: 77, heartsAwarded: {} });
    expect(batchCalls.at(-1)).toHaveLength(1);
  });

  it("recognizes ingested contestants in comments and awards +10 for @mentions", async () => {
    const { ingestRoutes } = await import("../src/routes/ingest");
    const { commentsWriteRoutes } = await import("../src/routes/comments");
    const app = new Hono().route("/api/public", ingestRoutes).route("/api", commentsWriteRoutes);

    const agents = ["claude", "gpt", "gemini", "grok", "kimi"].map((id) => ({ id, name: id.toUpperCase() }));
    let res = await app.request("https://arena.test/api/public/ingest", {
      method: "POST",
      body: JSON.stringify({ agents: { agents } }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true, counts: { agents: 5, snapshots: 0, decisions: 0 } });
    const contestantRows = insertValues.filter((value): value is { id: string; displayName: string } =>
      isRecord(value) && typeof value.id === "string" && typeof value.displayName === "string"
    );
    expect(contestantRows.map((row) => row.id)).toEqual(["claude", "gpt", "gemini", "grok", "kimi"]);

    queue.push([competition()], [{ id: "gemini" }]);
    res = await app.request("https://arena.test/api/comments", {
      method: "POST",
      body: JSON.stringify({ text: "@gemini x" }),
      headers: { "content-type": "application/json" },
    });

    expect(await res.json()).toEqual({ ok: true, id: 77, heartsAwarded: { gemini: 10 } });
    const commentRow = insertValues.find((value): value is { text: string; mentions: string } =>
      isRecord(value) && value.text === "@gemini x" && typeof value.mentions === "string"
    );
    expect(commentRow?.mentions).toBe("[\"gemini\"]");
    expect(batchCalls.at(-1)).toHaveLength(4);
  });

  it("returns the logged-in user from /api/me", async () => {
    const { meRoutes } = await import("../src/routes/me");
    const app = new Hono().route("/api", meRoutes);
    const res = await app.request("https://arena.test/api/me");
    expect(await res.json()).toMatchObject({ id: "user-1", email: "u@example.com", displayName: "User", isOwner: true });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
