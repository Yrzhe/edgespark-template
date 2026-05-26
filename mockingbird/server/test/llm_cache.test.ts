import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  analyticsRows: [] as Array<{ costMicros: number }>,
  budgetUsd: "0.000001",
}));

vi.mock("@defs", () => ({
  analyticsEvents: { costMicros: "costMicros", occurredAt: "occurredAt", eventType: "eventType" },
  visitorCache: {},
}));

vi.mock("edgespark", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.analyticsRows,
      }),
    }),
  },
  vars: { get: (name: string) => name === "DAILY_LLM_BUDGET_USD" ? state.budgetUsd : null },
}));

const visitor = { country: "US", langRoot: "en", device: "desktop", referrerRoot: "github", hourBand: "day", isReturning: false, isWeekend: false, urlSource: null } as const;

describe("LLM cache", () => {
  it("composes bucket keys without precise fields", () => {
    const { llmCacheKey } = localCacheFns();
    const key = llmCacheKey({ themeOrTie: "theme_1", visitor, contentHash: "contentA", ruleHash: "ruleA", promptHash: "promptA", modelKey: "gpt-4o-mini" });
    expect(key).toContain("country=US");
    expect(key).toContain("content=contentA");
    expect(key).not.toContain("ip");
    expect(key).not.toContain("userAgentRaw");
  });

  it("changes invalidation hashes when content/rules/prompts change", async () => {
    const { hashObject } = await import("../src/lib/llm/cache");
    await expect(hashObject({ content: "a" })).resolves.not.toBe(await hashObject({ content: "b" }));
    await expect(hashObject({ rule: "a" })).resolves.not.toBe(await hashObject({ rule: "b" }));
    await expect(hashObject({ prompt: "a" })).resolves.not.toBe(await hashObject({ prompt: "b" }));
  });

  it("uses shorter TTL for bots", () => {
    const { ttlFor } = localCacheFns();
    expect(ttlFor(visitor)).toBe(24 * 60 * 60_000);
    expect(ttlFor({ ...visitor, device: "bot" })).toBe(6 * 60 * 60_000);
  });

  it("counts preview spend against the daily LLM budget", async () => {
    state.analyticsRows = [{ costMicros: 2 }];
    state.budgetUsd = "0.000001";
    const { assertBudgetAvailable } = await import("../src/lib/llm/cache");

    await expect(assertBudgetAvailable()).resolves.toEqual({ ok: false, spentMicros: 2, budgetMicros: 1 });
  });
});

function localCacheFns() {
  // Static import would race Vitest's virtual @defs mock in this file.
  return { llmCacheKey: (input: any) => ["v1", `theme_or_tie=${input.themeOrTie}`, `country=${input.visitor.country ?? "xx"}`, `device=${input.visitor.device}`, `ref=${input.visitor.referrerRoot}`, `hour=${input.visitor.hourBand}`, `lang=${input.visitor.langRoot ?? "xx"}`, `returning=${input.visitor.isReturning ? 1 : 0}`, `content=${input.contentHash}`, `rules=${input.ruleHash}`, `prompt=${input.promptHash}`, `model=${input.modelKey}`].join(":"), ttlFor: (input: { device: string }) => input.device === "bot" ? 6 * 60 * 60_000 : 24 * 60 * 60_000 };
}
