import { describe, expect, it } from "vitest";

// TODO(scaffold): wire these assertions to `analyticsManageRoutes` and
// `publicRoutes` with generated Perch `@defs` tables and EdgeSpark SDK mocks.

type AnalyticsEvent = {
  id: string;
  pageId: string;
  linkId: string | null;
  eventType: "view" | "click";
  occurredAt: number;
  referrerHost: string | null;
  deviceType: string | null;
  country: string | null;
};

describe("analytics contract", () => {
  it("inserts narrow view and click events", () => {
    const events: AnalyticsEvent[] = [];

    insertEvent(events, { pageId: "p1", linkId: null, eventType: "view", occurredAt: 100, referrerHost: null });
    insertEvent(events, { pageId: "p1", linkId: "l1", eventType: "click", occurredAt: 200, referrerHost: "ref.example" });

    expect(events).toMatchObject([
      { pageId: "p1", linkId: null, eventType: "view", occurredAt: 100 },
      { pageId: "p1", linkId: "l1", eventType: "click", occurredAt: 200, referrerHost: "ref.example" },
    ]);
    expect(Object.keys(events[0]).sort()).toEqual([
      "country",
      "deviceType",
      "eventType",
      "id",
      "linkId",
      "occurredAt",
      "pageId",
      "referrerHost",
    ]);
  });

  it("aggregates page totals, CTR, top links, and dimensions over a date range", () => {
    const events: AnalyticsEvent[] = [
      event({ id: "v1", pageId: "p1", eventType: "view", occurredAt: 100, deviceType: "desktop", country: "US" }),
      event({ id: "v2", pageId: "p1", eventType: "view", occurredAt: 200, deviceType: "mobile", country: "CA" }),
      event({ id: "c1", pageId: "p1", linkId: "l1", eventType: "click", occurredAt: 300, referrerHost: "x.example" }),
      event({ id: "c2", pageId: "p1", linkId: "l1", eventType: "click", occurredAt: 400, referrerHost: "x.example" }),
      event({ id: "c3", pageId: "p1", linkId: "l2", eventType: "click", occurredAt: 500, referrerHost: "y.example" }),
      event({ id: "other", pageId: "p2", eventType: "click", occurredAt: 300 }),
    ];

    const result = aggregate(events, "p1", 0, 450);

    expect(result.totals).toEqual({ views: 2, clicks: 2, ctr: 1 });
    expect(result.dailySeries).toEqual([{ day: "1970-01-01", views: 2, clicks: 2 }]);
    expect(result.topLinks).toEqual([{ linkId: "l1", count: 2 }]);
    expect(result.referrers).toEqual([{ value: "x.example", count: 2 }]);
    expect(result.devices).toEqual([{ value: "unknown", count: 2 }, { value: "desktop", count: 1 }, { value: "mobile", count: 1 }]);
  });

  it("returns a zero-filled UTC daily time series for page analytics", () => {
    const from = Date.UTC(2026, 0, 1, 12);
    const to = Date.UTC(2026, 0, 4, 6);
    const events: AnalyticsEvent[] = [
      event({ id: "v1", pageId: "p1", eventType: "view", occurredAt: Date.UTC(2026, 0, 1, 23, 59) }),
      event({ id: "v2", pageId: "p1", eventType: "view", occurredAt: Date.UTC(2026, 0, 3, 0, 1) }),
      event({ id: "v3", pageId: "p1", eventType: "view", occurredAt: Date.UTC(2026, 0, 3, 9) }),
      event({ id: "c1", pageId: "p1", linkId: "l1", eventType: "click", occurredAt: Date.UTC(2026, 0, 3, 11) }),
      event({ id: "c2", pageId: "p1", linkId: "l1", eventType: "click", occurredAt: Date.UTC(2026, 0, 4, 5, 59) }),
      event({ id: "early", pageId: "p1", eventType: "view", occurredAt: Date.UTC(2026, 0, 1, 11, 59) }),
      event({ id: "other-page", pageId: "p2", eventType: "click", occurredAt: Date.UTC(2026, 0, 3, 11) }),
    ];

    const result = aggregate(events, "p1", from, to);

    expect(result.dailySeries).toEqual([
      { day: "2026-01-01", views: 1, clicks: 0 },
      { day: "2026-01-02", views: 0, clicks: 0 },
      { day: "2026-01-03", views: 2, clicks: 1 },
      { day: "2026-01-04", views: 0, clicks: 1 },
    ]);
  });

  it("validates date ranges and rejects ranges over 180 days", () => {
    expect(parseRange("100", "200")).toEqual({ ok: true, from: 100, to: 200 });
    expect(parseRange("200", "100")).toEqual({ ok: false, message: "from/to must be epoch-ms integers with to >= from." });
    expect(parseRange("x", "100")).toEqual({ ok: false, message: "from/to must be epoch-ms integers with to >= from." });
    expect(parseRange("0", String(181 * 24 * 60 * 60 * 1000))).toEqual({
      ok: false,
      message: "Range is limited to 180 days for raw analytics queries.",
    });
  });

  it("treats public analytics insertion as best-effort", async () => {
    const warnings: string[] = [];
    const result = await tryInsertPublicEvent(
      async () => {
        throw new Error("D1 unavailable");
      },
      (message) => warnings.push(message)
    );

    expect(result).toEqual({ ok: false });
    expect(warnings[0]).toContain("analytics_insert_failed");
  });
});

function insertEvent(events: AnalyticsEvent[], input: Omit<AnalyticsEvent, "id" | "deviceType" | "country">) {
  events.push({
    id: `e${events.length + 1}`,
    deviceType: "unknown",
    country: null,
    ...input,
  });
}

function aggregate(events: AnalyticsEvent[], pageId: string, from: number, to: number) {
  const scoped = events.filter((e) => e.pageId === pageId && e.occurredAt >= from && e.occurredAt <= to);
  const views = scoped.filter((e) => e.eventType === "view").length;
  const clicks = scoped.filter((e) => e.eventType === "click").length;
  return {
    totals: { views, clicks, ctr: views > 0 ? clicks / views : 0 },
    dailySeries: dailySeries(scoped, from, to),
    topLinks: group(scoped.filter((e) => e.eventType === "click"), (e) => e.linkId ?? "unknown").map(({ value, count }) => ({ linkId: value, count })),
    referrers: group(scoped, (e) => e.referrerHost ?? "unknown").filter((row) => row.value !== "unknown"),
    devices: group(scoped, (e) => e.deviceType ?? "unknown"),
  };
}

function dailySeries(events: AnalyticsEvent[], from: number, to: number) {
  const counts = new Map<string, { views: number; clicks: number }>();
  for (const e of events) {
    const day = dayKey(e.occurredAt);
    const bucket = counts.get(day) ?? { views: 0, clicks: 0 };
    if (e.eventType === "view") bucket.views += 1;
    if (e.eventType === "click") bucket.clicks += 1;
    counts.set(day, bucket);
  }

  const series: Array<{ day: string; views: number; clicks: number }> = [];
  const start = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    const day = dayKey(cursor);
    const bucket = counts.get(day) ?? { views: 0, clicks: 0 };
    series.push({ day, views: bucket.views, clicks: bucket.clicks });
  }
  return series;
}

function dayKey(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfUtcDay(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseRange(rawFrom: string, rawTo: string) {
  const from = Number(rawFrom);
  const to = Number(rawTo);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
    return { ok: false as const, message: "from/to must be epoch-ms integers with to >= from." };
  }
  if (to - from > 180 * 24 * 60 * 60 * 1000) {
    return { ok: false as const, message: "Range is limited to 180 days for raw analytics queries." };
  }
  return { ok: true as const, from, to };
}

function group<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function event(overrides: Partial<AnalyticsEvent>): AnalyticsEvent {
  return {
    id: "e",
    pageId: "p1",
    linkId: null,
    eventType: "view",
    occurredAt: 0,
    referrerHost: null,
    deviceType: "unknown",
    country: null,
    ...overrides,
  };
}

async function tryInsertPublicEvent(insert: () => Promise<void>, warn: (message: string) => void) {
  try {
    await insert();
    return { ok: true as const };
  } catch (error) {
    warn(JSON.stringify({ level: "warn", code: "analytics_insert_failed", error: String(error) }));
    return { ok: false as const };
  }
}
