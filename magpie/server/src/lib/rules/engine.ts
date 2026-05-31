import { deltaE2000, hexToLab } from "./color";

export interface CardDraftForRules {
  colors?: string[];
  slots?: Array<{ id: string; x: number; y: number; width: number; height: number; kind?: string }>;
  wordmark?: { slotId: string; height: number };
  letterforms?: Array<{ key: string; transformDeviationPct: number }>;
}

export interface RuleConfig {
  rule_id: "palette_lch_distance" | "clearspace_minimum" | "letterform_fidelity";
  version: number;
  threshold: number;
  canonicalPalette?: string[];
}

export interface RuleResult {
  rule_id: string;
  version: number;
  score: number;
  threshold: number;
  pass: boolean;
  evidence: Record<string, unknown>;
}

export interface RuleReport {
  pass: boolean;
  score: number;
  rules: RuleResult[];
}

export function baselineRules(canonicalPalette: string[] = ["#2556B6", "#F36440", "#BC4E32", "#0C0A0F", "#F7F5F1", "#FFFFFF"]): RuleConfig[] {
  return [
    { rule_id: "palette_lch_distance", version: 1, threshold: 8, canonicalPalette },
    { rule_id: "clearspace_minimum", version: 1, threshold: 0.8 },
    { rule_id: "letterform_fidelity", version: 1, threshold: 3 },
  ];
}

export function evaluateCardRules(draft: CardDraftForRules, rules = baselineRules()): RuleReport {
  const normalized = rules.map(normalizeRuleConfig);
  const results = normalized.map((rule) => {
    if (rule.rule_id === "palette_lch_distance") return paletteRule(draft, rule);
    if (rule.rule_id === "clearspace_minimum") return clearspaceRule(draft, rule);
    return letterformRule(draft, rule);
  });
  const score = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  return { pass: results.every((result) => result.pass), score, rules: results };
}

function normalizeRuleConfig(rule: RuleConfig | any): RuleConfig {
  const key = String(rule.rule_id ?? rule.kind ?? rule.id ?? "");
  if (key === "palette" || key === "palette_lch_distance") {
    return {
      rule_id: "palette_lch_distance",
      version: Number(rule.version ?? 1),
      threshold: numericThreshold(rule.threshold, "deltaE", 8),
      canonicalPalette: Array.isArray(rule.canonicalPalette) ? rule.canonicalPalette : baselineRules()[0].canonicalPalette,
    };
  }
  if (key === "clearspace" || key === "clearspace_minimum") {
    return {
      rule_id: "clearspace_minimum",
      version: Number(rule.version ?? 1),
      threshold: numericThreshold(rule.threshold, "pct", 0.8),
    };
  }
  return {
    rule_id: "letterform_fidelity",
    version: Number(rule.version ?? 1),
    threshold: numericThreshold(rule.threshold, "transformDeviationPct", 3),
  };
}

function numericThreshold(value: unknown, objectKey: string, fallback: number): number {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[objectKey] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}


function paletteRule(draft: CardDraftForRules, rule: RuleConfig): RuleResult {
  const palette = (rule.canonicalPalette ?? []).map((hex) => ({ hex, lab: hexToLab(hex) })).filter((item): item is { hex: string; lab: NonNullable<ReturnType<typeof hexToLab>> } => !!item.lab);
  const distances = (draft.colors ?? []).map((hex) => {
    const lab = hexToLab(hex);
    if (!lab || !palette.length) return { color: hex, nearest: null, deltaE: Number.POSITIVE_INFINITY };
    const nearest = palette.map((p) => ({ hex: p.hex, deltaE: deltaE2000(lab, p.lab) })).sort((a, b) => a.deltaE - b.deltaE)[0];
    return { color: hex, nearest: nearest.hex, deltaE: Number(nearest.deltaE.toFixed(2)) };
  });
  const maxDelta = distances.reduce((max, item) => Math.max(max, item.deltaE), 0);
  return {
    rule_id: rule.rule_id,
    version: rule.version,
    score: scoreFrom(maxDelta, rule.threshold),
    threshold: rule.threshold,
    pass: distances.length > 0 && maxDelta <= rule.threshold,
    evidence: { distances },
  };
}

function clearspaceRule(draft: CardDraftForRules, rule: RuleConfig): RuleResult {
  const wordmark = draft.wordmark;
  const slots = draft.slots ?? [];
  const wm = wordmark ? slots.find((slot) => slot.id === wordmark.slotId) : null;
  if (!wordmark || !wm) return result(rule, 0, false, { reason: "missing_wordmark_slot" });
  const required = wordmark.height * rule.threshold;
  const violations = slots.filter((slot) => slot.id !== wm.id).map((slot) => ({ slotId: slot.id, distance: rectDistance(wm, slot) })).filter((item) => item.distance < required);
  const nearest = slots.filter((slot) => slot.id !== wm.id).reduce((min, slot) => Math.min(min, rectDistance(wm, slot)), Number.POSITIVE_INFINITY);
  return result(rule, Number.isFinite(nearest) ? Math.round(Math.min(100, nearest / required * 100)) : 100, violations.length === 0, { required, nearest, violations });
}

function letterformRule(draft: CardDraftForRules, rule: RuleConfig): RuleResult {
  const deviations = draft.letterforms ?? [];
  const maxDeviation = deviations.reduce((max, item) => Math.max(max, item.transformDeviationPct), 0);
  return result(rule, scoreFrom(maxDeviation, rule.threshold), deviations.length > 0 && maxDeviation <= rule.threshold, { deviations, maxDeviation });
}

function result(rule: RuleConfig, score: number, pass: boolean, evidence: Record<string, unknown>): RuleResult {
  return { rule_id: rule.rule_id, version: rule.version, score, threshold: rule.threshold, pass, evidence };
}

function scoreFrom(value: number, threshold: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= threshold) return Math.max(80, Math.round(100 - (value / Math.max(threshold, 1)) * 20));
  return Math.max(0, Math.round(80 - ((value - threshold) / Math.max(threshold, 1)) * 80));
}

function rectDistance(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.sqrt(dx * dx + dy * dy);
}
