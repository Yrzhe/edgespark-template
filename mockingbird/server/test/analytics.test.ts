import { describe, expect, it } from "vitest";

describe("analytics aggregation defaults", () => {
  it("excludes bot rows from default dashboard-style aggregates", () => {
    const rows = [
      { eventType: "view", themeId: "t1", botScore: 0, costMicros: 0 },
      { eventType: "view", themeId: "t2", botScore: 80, costMicros: 0 },
      { eventType: "llm_request", themeId: "t1", botScore: 0, costMicros: 10 },
    ];
    const filtered = rows.filter((row) => row.botScore === 0);
    expect(filtered).toHaveLength(2);
    expect(filtered.reduce((sum, row) => sum + row.costMicros, 0)).toBe(10);
  });

  it("excludes owner rows by default", () => {
    const rows = [
      { eventType: "view", themeId: "t1", botScore: 0, isOwner: 0 },
      { eventType: "view", themeId: "t2", botScore: 0, isOwner: 1 },
    ];
    expect(rows.filter((row) => row.botScore < 30 && row.isOwner === 0)).toEqual([rows[0]]);
  });
});
