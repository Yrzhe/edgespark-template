import { evaluateCardRules, type CardDraftForRules, type RuleReport } from "../rules/engine";

export interface ComposeInput {
  cardId?: string;
  cardSpec: Record<string, unknown>;
  slotAssignments: Record<string, unknown>;
  copyBlock: Record<string, unknown>;
  dims: { width: number; height: number };
  draftForRules: CardDraftForRules;
}

export interface ComposeResult {
  renderManifest: Record<string, unknown>;
  ruleReport: RuleReport;
}

export function composeCard(input: ComposeInput): ComposeResult {
  if (!Number.isInteger(input.dims.width) || !Number.isInteger(input.dims.height)) throw new Error("invalid_dims");
  const ruleReport = evaluateCardRules(input.draftForRules);
  return {
    ruleReport,
    renderManifest: {
      renderer: "worker-og-placeholder",
      cardId: input.cardId ?? null,
      width: input.dims.width,
      height: input.dims.height,
      status: "planned",
      cardSpecHash: stableHash(input.cardSpec),
      slotCount: Object.keys(input.slotAssignments).length,
      copyKeys: Object.keys(input.copyBlock),
    },
  };
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}
