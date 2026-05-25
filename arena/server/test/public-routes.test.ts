import { describe, expect, it, vi, beforeEach } from "vitest";

const queue: unknown[][] = [];
const insertReturns: unknown[][] = [];
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
      onConflictDoUpdate: () => Promise.resolve(),
      onConflictDoNothing: () => ({ returning: () => Promise.resolve(insertReturns.shift() ?? [{ id: 1 }]) }),
      returning: () => Promise.resolve([{ id: 1 }]),
    };
    },
  }),
  update: () => ({
    set: () => ({
      where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }),
    }),
  }),
  batch: async (items: unknown[]) => Promise.all(items),
};

vi.mock("edgespark", () => ({
  db,
  ctx: { environment: "dev", runInBackground: () => undefined },
  storage: {
    createS3Uri: (_bucket: unknown, path: string) => `s3://arena-media/${path}`,
    tryParseS3Uri: () => null,
    from: () => ({
      createPresignedGetUrl: async () => ({ downloadUrl: "https://asset.test", expiresAt: new Date() }),
      createPresignedPutUrl: async () => ({ uploadUrl: "https://upload.test", requiredHeaders: {}, expiresAt: new Date() }),
      head: async () => ({ size: 100, contentType: "image/png" }),
    }),
  },
  vars: { get: () => null },
  secret: { get: () => null },
}), { virtual: true });

vi.mock("edgespark/http", () => ({ auth: { user: null } }), { virtual: true });

function competition() {
  return {
    id: "current",
    title: "Live Trading Arena",
    status: "live",
    startsAt: null,
    endsAt: null,
    upstreamBaseUrl: "https://arena.test/api/public/mock",
    votingEnabled: 1,
    commentsEnabled: 1,
    activeSeasonId: "season-1",
    updatedAt: 1,
  };
}

describe("public routes with mocked EdgeSpark runtime", () => {
  beforeEach(() => {
    queue.splice(0);
    insertReturns.splice(0);
    insertValues.splice(0);
  });

  it("serves competition, contestants, votes, comments, and selected equity series", async () => {
    const { default: app } = await import("../src/index");
    queue.push([competition()]);
    let res = await app.request("https://arena.test/api/public/competition");
    expect(await res.json()).toMatchObject({ status: "live", commentsEnabled: true, seasonId: "season-1", upstreamBaseUrl: "https://arena.test/api/public/mock" });

    queue.push(
      [competition()],
      [{ payload: JSON.stringify({ agents: [
        { id: "claude", name: "Claude", color: "#fff", account: { equity: "120" }, metrics: { returnPct: "2", totalPnl: "20", sharpe: "1.2", winRate: "0.6" } },
        { id: "gpt", name: "GPT", color: "#000", account: { equity: "100" }, metrics: {} },
      ] }), fetchedAt: Date.now() }],
      [{ id: "claude", displayName: "Edited", tagline: "Manual", avatarS3Uri: null, accentColor: "#abc", sortOrder: 0, hidden: 0, updatedAt: 1 }],
      [{ seasonId: "season-1", contestantId: "claude", total: 5 }]
    );
    res = await app.request("https://arena.test/api/public/contestants");
    const contestants = await res.json();
    expect(contestants.contestants[0]).toMatchObject({ id: "claude", displayName: "Edited", rank: 1, votes: 5 });

    queue.push([competition()], [{ seasonId: "season-1", contestantId: "claude", total: 5 }]);
    res = await app.request("https://arena.test/api/public/votes");
    expect(await res.json()).toEqual({ seasonId: "season-1", totals: { claude: 5 } });

    queue.push([competition()], [{ id: 1, seasonId: "season-1", userId: "u1", displayName: "U", text: "hi @claude", mentions: "[\"claude\"]", createdAt: 10, hidden: 0 }]);
    res = await app.request("https://arena.test/api/public/comments?since=0");
    expect((await res.json()).comments[0]).toMatchObject({ text: "hi @claude", mentions: ["claude"] });

    const fetchedAtIso = new Date().toISOString();
    queue.push([competition()], [{ payload: JSON.stringify({ snapshots: { claude: [{ fetchedAt: fetchedAtIso, equity: "120" }], gpt: [{ fetchedAt: Date.now(), equity: "100" }] } }), fetchedAt: Date.now() }]);
    res = await app.request("https://arena.test/api/public/equity-series?ids=claude");
    const equityBody = await res.json();
    expect(Object.keys(equityBody.series)).toEqual(["claude"]);
    expect(equityBody.series.claude).toEqual([{ t: Date.parse(fetchedAtIso), equity: 120 }]);

    queue.push(
      [competition()],
      [{ seasonId: "season-1", contestantId: "claude", total: 15 }],
      [
        { seasonId: "season-1", contestantId: "claude", bucketStart: 60000, count: 5 },
        { seasonId: "season-1", contestantId: "claude", bucketStart: 120000, count: 10 },
      ]
    );
    const beforeSeries = Date.now();
    res = await app.request("https://arena.test/api/public/votes/series?ids=claude");
    const afterSeries = Date.now();
    const voteSeries = (await res.json()).series.claude;
    expect(voteSeries.slice(0, 3)).toEqual([{ t: 60000, count: 0 }, { t: 60000, count: 5 }, { t: 120000, count: 15 }]);
    expect(voteSeries.at(-1).count).toBe(15);
    expect(voteSeries.at(-1).t).toBeGreaterThanOrEqual(beforeSeries);
    expect(voteSeries.at(-1).t).toBeLessThanOrEqual(afterSeries);

    queue.push(
      [competition()],
      [
        { id: 2, contestantId: "gpt", symbol: "MSFT", action: "sell", qty: 1, price: 2, confidence: 0.5, reasoning: "", justification: "", chainOfThought: "", timestamp: 120500, createdAt: 120500 },
        { id: 1, contestantId: "claude", symbol: "AAPL", action: "buy", qty: 1, price: 2, confidence: 0.7, reasoning: "", justification: "", chainOfThought: "", timestamp: 120100, createdAt: 120100 },
      ],
    );
    res = await app.request("https://arena.test/api/public/decisions/by-minute?limit=1");
    expect((await res.json()).minutes[0].items.map((item: { id: number }) => item.id)).toEqual([2, 1]);

    res = await app.request("https://arena.test/api/me");
    expect(res.status).toBe(401);
  });

  it("ingests upstream payloads and empty D1 caches return empty public data", async () => {
    const { default: app } = await import("../src/index");
    insertReturns.push([{ id: 10 }], []);
    let res = await app.request("https://arena.test/api/public/ingest", {
      method: "POST",
      body: JSON.stringify({
        agents: { agents: [{ id: "claude", name: "Claude", account: { equity: "100" }, metrics: {} }] },
        snapshots: { snapshots: { claude: [{ fetchedAt: 1000, equity: "100" }] } },
        decisions: { decisions: [
          { id: 10, agentId: "claude", symbol: "AAPL", action: "buy", createdAt: 1000, timestamp: 1000 },
          { id: 10, agentId: "claude", symbol: "AAPL", action: "buy", createdAt: 1000, timestamp: 1000 },
        ] },
      }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true, counts: { agents: 1, snapshots: 1, decisions: 1 } });

    queue.push([competition()], [], [], []);
    res = await app.request("https://arena.test/api/public/contestants");
    expect(await res.json()).toEqual({ contestants: [] });

    queue.push([competition()], []);
    res = await app.request("https://arena.test/api/public/equity-series");
    expect(await res.json()).toEqual({ series: {} });
  });

  it("counts upstream decisions from ingest payloads by unique upstream id", async () => {
    const { default: app } = await import("../src/index");
    const decisions = Array.from({ length: 19 }, (_, index) => ({
      id: index + 1,
      agentId: index % 2 === 0 ? "claude" : "gpt",
      symbol: "AAPL",
      action: "buy",
      qty: 1,
      price: "200.5",
      confidence: "0.8",
      reasoning: "r",
      justification: "j",
      chainOfThought: "c",
      timestamp: "2026-04-21T00:00:00.000Z",
      createdAt: "2026-04-21T00:00:00.000Z",
    }));

    const res = await app.request("https://arena.test/api/public/ingest", {
      method: "POST",
      body: JSON.stringify({ decisions: { decisions } }),
      headers: { "content-type": "application/json" },
    });

    expect(await res.json()).toEqual({ ok: true, counts: { agents: 0, snapshots: 0, decisions: 19 } });
  });

  it("upserts ingested agent ids into local contestants without requiring manual sync", async () => {
    const { default: app } = await import("../src/index");
    const agents = ["claude", "gpt", "gemini", "grok", "kimi"].map((id, index) => ({
      id,
      name: id.toUpperCase(),
      color: `#00000${index}`,
    }));

    const res = await app.request("https://arena.test/api/public/ingest", {
      method: "POST",
      body: JSON.stringify({ agents: { agents } }),
      headers: { "content-type": "application/json" },
    });

    expect(await res.json()).toEqual({ ok: true, counts: { agents: 5, snapshots: 0, decisions: 0 } });
    const contestantRows = insertValues.filter((value): value is { id: string; displayName: string; sortOrder: number } =>
      isRecord(value) && typeof value.id === "string" && typeof value.displayName === "string" && typeof value.sortOrder === "number"
    );
    expect(contestantRows.map((row) => row.id)).toEqual(["claude", "gpt", "gemini", "grok", "kimi"]);
    expect(contestantRows.map((row) => row.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns at least the 3d points when series range is all", async () => {
    const { default: app } = await import("../src/index");
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const oldPoint = now - 4 * day;
    const recentPoint = now - day;
    const snapshotPayload = {
      snapshots: {
        claude: [
          { fetchedAt: oldPoint, equity: "80" },
          { fetchedAt: recentPoint, equity: "120" },
        ],
      },
    };

    queue.push([competition()], [{ payload: JSON.stringify(snapshotPayload), fetchedAt: now }]);
    let res = await app.request("https://arena.test/api/public/equity-series?ids=claude&range=3d");
    const equity3d = await res.json();

    queue.push([competition()], [{ payload: JSON.stringify(snapshotPayload), fetchedAt: now }]);
    res = await app.request("https://arena.test/api/public/equity-series?ids=claude&range=all");
    const equityAll = await res.json();
    expect(equityAll.series.claude.length).toBeGreaterThanOrEqual(equity3d.series.claude.length);
    expect(equity3d.series.claude).toHaveLength(1);
    expect(equityAll.series.claude).toHaveLength(2);

    queue.push(
      [competition()],
      [{ seasonId: "season-1", contestantId: "claude", total: 15 }],
      [{ seasonId: "season-1", contestantId: "claude", bucketStart: recentPoint, count: 10 }]
    );
    res = await app.request("https://arena.test/api/public/votes/series?ids=claude&range=3d");
    const afterVotes3d = Date.now();
    const votes3d = await res.json();
    expect(votes3d.series.claude[0].count).toBe(0);
    expect(votes3d.series.claude.at(-1).count).toBe(10);
    expect(votes3d.series.claude.at(-1).t).toBeLessThanOrEqual(afterVotes3d);

    queue.push(
      [competition()],
      [{ seasonId: "season-1", contestantId: "claude", total: 15 }],
      [
        { seasonId: "season-1", contestantId: "claude", bucketStart: oldPoint, count: 5 },
        { seasonId: "season-1", contestantId: "claude", bucketStart: recentPoint, count: 10 },
      ]
    );
    res = await app.request("https://arena.test/api/public/votes/series?ids=claude&range=max");
    const afterVotesAll = Date.now();
    const votesAll = await res.json();
    expect(votesAll.series.claude[0].count).toBe(0);
    expect(votesAll.series.claude.at(-1).count).toBe(15);
    expect(votesAll.series.claude.at(-1).t).toBeLessThanOrEqual(afterVotesAll);
    expect(votesAll.series.claude.length).toBeGreaterThanOrEqual(votes3d.series.claude.length);
    expect(votes3d.series.claude).toHaveLength(3);
    expect(votesAll.series.claude).toHaveLength(4);
  });

  it("covers management read/edit/sync routes with mocked DB", async () => {
    const { manageRoutes } = await import("../src/routes/manage");
    const { Hono } = await import("hono");
    const app = new Hono().route("/manage", manageRoutes);

    queue.push([competition()]);
    let res = await app.request("https://arena.test/manage/competition");
    expect((await res.json()).competition.status).toBe("live");

    queue.push([competition()]);
    res = await app.request("https://arena.test/manage/competition", {
      method: "PATCH",
      body: JSON.stringify({ title: "Arena v2", commentsEnabled: false }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    queue.push([competition()]);
    res = await app.request("https://arena.test/manage/competition", {
      method: "PATCH",
      body: JSON.stringify({ upstreamBaseUrl: "http://169.254.169.254/latest/meta-data" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);

    queue.push([{ id: "claude", displayName: "Claude" }]);
    res = await app.request("https://arena.test/manage/contestants");
    expect((await res.json()).contestants).toHaveLength(1);

    queue.push(
      [competition()],
      [{ payload: JSON.stringify({ agents: [{ id: "claude", name: "Claude" }, { id: "kimi", name: "Kimi" }] }), fetchedAt: Date.now() }],
      [{ id: "claude" }],
      [{ id: "claude" }, { id: "kimi" }]
    );
    res = await app.request("https://arena.test/manage/contestants/sync", { method: "POST" });
    expect((await res.json()).inserted).toBe(1);

    queue.push([{ id: 1, text: "hi" }]);
    res = await app.request("https://arena.test/manage/comments");
    expect((await res.json()).comments).toHaveLength(1);

    queue.push([{ id: "key-1", name: "agent" }]);
    res = await app.request("https://arena.test/manage/keys");
    expect((await res.json()).keys).toHaveLength(1);

    res = await app.request("https://arena.test/manage/contestants/claude", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Claude 2", hidden: false }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    res = await app.request("https://arena.test/manage/contestants/reorder", {
      method: "POST",
      body: JSON.stringify({ items: [{ id: "claude", sortOrder: 2 }] }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    res = await app.request("https://arena.test/manage/contestants/claude/avatar/presign", {
      method: "POST",
      body: JSON.stringify({ contentType: "image/png" }),
      headers: { "content-type": "application/json" },
    });
    expect((await res.json()).url).toBe("https://upload.test");

    res = await app.request("https://arena.test/manage/contestants/claude/avatar/confirm", {
      method: "POST",
      body: JSON.stringify({ key: "contestants/claude/asset/avatar.png" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    queue.push([competition()]);
    res = await app.request("https://arena.test/manage/votes/reset", { method: "POST" });
    expect(res.status).toBe(200);

    res = await app.request("https://arena.test/manage/comments/1/hide", { method: "PATCH" });
    expect(res.status).toBe(200);

    res = await app.request("https://arena.test/manage/keys", {
      method: "POST",
      body: JSON.stringify({ name: "agent" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(201);

    res = await app.request("https://arena.test/manage/keys/key-1", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
