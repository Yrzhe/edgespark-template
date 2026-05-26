import { describe, expect, it } from "vitest";
import { validateLlmOutput } from "../src/lib/llm/schema";

const input = { candidateThemeIds: ["theme_1"], allowedBlockKeys: ["hero-headline", "hero-intro", "project-p1"], requiredBlockKeys: ["hero-headline", "hero-intro"], projectIds: ["p1"] };

describe("LLM schema validation", () => {
  it("accepts plain text blocks and known project summaries", () => {
    const result = validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "Hello", "hero-intro": "Intro" }, projectSummaries: [{ projectId: "p1", title: "One" }] }, input);
    expect(result.ok).toBe(true);
  });

  it("rejects HTML, markdown tables, unknown projects, unknown blocks, and oversize text", () => {
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "<b>bad</b>" } }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "**bad**", "hero-intro": "Intro" } }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "[bad](https://example.com)", "hero-intro": "Intro" } }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "| a |\n|---|" } }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "unknown": "bad" } }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "ok" }, projectSummaries: [{ projectId: "p2" }] }, input).ok).toBe(false);
    expect(validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "hero-headline": "x".repeat(701) } }, input).ok).toBe(false);
  });

  it("rejects rewrites missing required hero blocks", () => {
    const result = validateLlmOutput({ selectedThemeId: "theme_1", blocks: { "project-p1": "Only optional copy" } }, input);
    expect(result).toEqual({ ok: false, reason: "missing_required_block" });
  });
});
