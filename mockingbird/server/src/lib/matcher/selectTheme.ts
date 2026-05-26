import type { VisitorPromptSafe } from "../signals/types";
import { evaluateRule } from "../rules/evaluator";
import type { RuleAst } from "../rules/parser";

export type ThemeRow = { id: string; priority: number; abWeight: number; updatedAt: number; isDefault: number; status?: string; layoutKey?: string; name?: string };
export type RuleRow = { themeId: string; compiledJson: string; score: number; enabled: number };
export type ThemeSelection = { theme: ThemeRow; score: number; candidates: Array<{ theme: ThemeRow; score: number }> };

export function selectTheme(input: {
  themes: ThemeRow[];
  rules: RuleRow[];
  visitor: VisitorPromptSafe;
  bucketSeed: string;
  llmTieMargin?: number;
}): ThemeSelection {
  const active = input.themes.filter((t) => !t.status || t.status === "active");
  const themes = active.length ? active : seedThemes();
  const rulesByTheme = new Map<string, RuleRow[]>();
  for (const rule of input.rules) if (rule.enabled === 1) rulesByTheme.set(rule.themeId, [...(rulesByTheme.get(rule.themeId) ?? []), rule]);
  let scored = themes.map((theme) => {
    let score = theme.priority;
    let matched = false;
    for (const rule of rulesByTheme.get(theme.id) ?? []) {
      try {
        if (evaluateRule(JSON.parse(rule.compiledJson) as RuleAst, input.visitor)) {
          score += rule.score;
          matched = true;
        }
      } catch {
        // Invalid persisted rules are ignored at runtime; write paths compile first.
      }
    }
    if (!matched && theme.isDefault === 1) score += 1;
    return { theme, score };
  });
  const positive = scored.filter((row) => row.score > 0);
  if (positive.length) scored = positive;
  scored.sort((a, b) => b.score - a.score || b.theme.priority - a.theme.priority || abRank(b.theme, input.bucketSeed) - abRank(a.theme, input.bucketSeed) || b.theme.updatedAt - a.theme.updatedAt || a.theme.id.localeCompare(b.theme.id));
  const fallback = scored[0] ?? { theme: seedThemes()[0], score: 1 };
  const margin = input.llmTieMargin ?? 5;
  return { theme: fallback.theme, score: fallback.score, candidates: scored.filter((row) => fallback.score - row.score <= margin).slice(0, 4) };
}

function abRank(theme: ThemeRow, seed: string): number {
  if (theme.abWeight <= 0) return -1;
  let hash = 0;
  for (const ch of `${seed}:${theme.id}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 1000 < theme.abWeight ? 1 : 0;
}

function seedThemes(): ThemeRow[] {
  return [{ id: "seed_letter", priority: 0, abWeight: 1000, updatedAt: 0, isDefault: 1, status: "active", layoutKey: "letter", name: "Letter" }];
}
