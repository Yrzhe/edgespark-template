import type { VisitorPromptSafe } from "../signals/types";

export function composeCacheKey(input: {
  themeOrTie: string;
  visitor: VisitorPromptSafe;
  contentHash: string;
  ruleHash: string;
  promptHash: string;
  modelKey: string;
}): string {
  const v = input.visitor;
  return [
    "v1",
    `theme_or_tie=${safe(input.themeOrTie)}`,
    `country=${v.country ?? "xx"}`,
    `device=${v.device}`,
    `ref=${v.referrerRoot}`,
    `hour=${v.hourBand}`,
    `lang=${v.langRoot ?? "xx"}`,
    `returning=${v.isReturning ? 1 : 0}`,
    `content=${safe(input.contentHash)}`,
    `rules=${safe(input.ruleHash)}`,
    `prompt=${safe(input.promptHash)}`,
    `model=${safe(input.modelKey)}`,
  ].join(":");
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}
