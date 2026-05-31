import { describe, expect, it } from "vitest";
import { baselineRules, evaluateCardRules } from "../src/lib/rules/engine";

describe("brand rule engine", () => {
  it("returns the baseline rule report shape", () => {
    const report = evaluateCardRules({
      colors: ["#2556B6", "#F36440"],
      slots: [
        { id: "wordmark", x: 0, y: 0, width: 100, height: 20 },
        { id: "headline", x: 0, y: 40, width: 200, height: 20 },
      ],
      wordmark: { slotId: "wordmark", height: 20 },
      letterforms: [
        { key: "b", transformDeviationPct: 1 },
        { key: "e", transformDeviationPct: 2 },
      ],
    }, baselineRules());
    expect(report.pass).toBe(true);
    expect(report.rules.map((rule) => rule.rule_id)).toEqual(["palette_lch_distance", "clearspace_minimum", "letterform_fidelity"]);
    expect(report.rules[0]).toHaveProperty("evidence.distances");
  });
});
