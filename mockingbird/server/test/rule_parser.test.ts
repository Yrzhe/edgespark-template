import { describe, expect, it } from "vitest";
import { parseRule } from "../src/lib/rules/parser";
import { evaluateRule } from "../src/lib/rules/evaluator";
import { explainRule } from "../src/lib/rules/explain";

const visitor = { country: "US", langRoot: "en", device: "desktop", referrerRoot: "github", hourBand: "day", isReturning: false, isWeekend: false, urlSource: "tw" } as const;

describe("rule parser", () => {
  it("parses and evaluates the DSL AST", () => {
    const ast = parseRule("referrer~/github|hn/ AND device==desktop");
    expect(evaluateRule(ast, visitor)).toBe(true);
    expect(explainRule(ast)).toContain("referrer matches");
  });

  it("rejects unsupported regex constructs and deep rules", () => {
    expect(() => parseRule("referrer~/(github)+/")).toThrow();
    expect(() => parseRule("referrer~/(?=github)/")).toThrow();
    expect(() => parseRule("NOT (NOT (NOT (NOT (NOT (NOT country==US)))))")).toThrow();
  });

  it("rejects over-1KB rules and over-120-character regex bodies", () => {
    expect(() => parseRule(`country==${"A".repeat(1100)}`)).toThrow("Rule is too long.");
    expect(() => parseRule(`referrer~/${"a".repeat(121)}/`)).toThrow("Regex length is invalid.");
  });

  it("supports in, not equal, and booleans", () => {
    const ast = parseRule("country in [US,CA] AND is_returning!=true");
    expect(evaluateRule(ast, visitor)).toBe(true);
  });
});
