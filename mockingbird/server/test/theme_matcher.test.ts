import { describe, expect, it } from "vitest";
import { selectTheme } from "../src/lib/matcher/selectTheme";
import { parseRule } from "../src/lib/rules/parser";

describe("theme matcher", () => {
  it("scores matching rules and falls back to default", () => {
    const visitor = { country: "US", langRoot: "en", device: "desktop", referrerRoot: "github", hourBand: "day", isReturning: false, isWeekend: false, urlSource: null } as const;
    const themes = [
      { id: "letter", priority: 0, abWeight: 1000, updatedAt: 1, isDefault: 1, status: "active" },
      { id: "terminal", priority: 2, abWeight: 1000, updatedAt: 2, isDefault: 0, status: "active" },
    ];
    const rules = [{ themeId: "terminal", compiledJson: JSON.stringify(parseRule("referrer~/github|hn/ AND device==desktop")), score: 20, enabled: 1 }];
    const selected = selectTheme({ themes, rules, visitor, bucketSeed: "seed" });
    expect(selected.theme.id).toBe("terminal");
    expect(selected.score).toBe(22);
  });
});
