export type LlmRewrite = {
  selectedThemeId: string;
  blocks: Record<string, string>;
  projectSummaries?: Array<{ projectId: string; title?: string; description?: string }>;
};

export type ValidationInput = {
  candidateThemeIds: readonly string[];
  allowedBlockKeys: readonly string[];
  requiredBlockKeys?: readonly string[];
  projectIds: readonly string[];
};

const MAX_BLOCK_CHARS = 700;
const MAX_SUMMARY_CHARS = 280;

export function validateLlmOutput(raw: unknown, input: ValidationInput): { ok: true; value: LlmRewrite } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: "output_not_object" };
  if (typeof raw.selectedThemeId !== "string" || !input.candidateThemeIds.includes(raw.selectedThemeId)) return { ok: false, reason: "invalid_selected_theme" };
  if (!isRecord(raw.blocks)) return { ok: false, reason: "blocks_not_object" };
  const allowed = new Set(input.allowedBlockKeys);
  const blocks: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.blocks)) {
    if (!allowed.has(key)) return { ok: false, reason: "unknown_block_key" };
    if (typeof value !== "string" || !isPlainText(value, MAX_BLOCK_CHARS)) return { ok: false, reason: "invalid_block_text" };
    const trimmed = value.trim();
    if (trimmed) blocks[key] = trimmed;
  }
  if (Object.keys(blocks).length === 0) return { ok: false, reason: "empty_blocks" };
  for (const required of input.requiredBlockKeys ?? []) {
    if (!blocks[required]) return { ok: false, reason: "missing_required_block" };
  }
  const projectSummaries = parseProjectSummaries(raw.projectSummaries, input.projectIds);
  if (!projectSummaries.ok) return projectSummaries;
  return { ok: true, value: { selectedThemeId: raw.selectedThemeId, blocks, projectSummaries: projectSummaries.value } };
}

function parseProjectSummaries(raw: unknown, projectIds: readonly string[]) {
  if (raw === undefined) return { ok: true as const, value: undefined };
  if (!Array.isArray(raw)) return { ok: false as const, reason: "project_summaries_not_array" };
  const ids = new Set(projectIds);
  const summaries: Array<{ projectId: string; title?: string; description?: string }> = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.projectId !== "string" || !ids.has(item.projectId)) return { ok: false as const, reason: "unknown_project_id" };
    const summary: { projectId: string; title?: string; description?: string } = { projectId: item.projectId };
    if (item.title !== undefined) {
      if (typeof item.title !== "string" || !isPlainText(item.title, MAX_SUMMARY_CHARS)) return { ok: false as const, reason: "invalid_project_title" };
      summary.title = item.title.trim();
    }
    if (item.description !== undefined) {
      if (typeof item.description !== "string" || !isPlainText(item.description, MAX_SUMMARY_CHARS)) return { ok: false as const, reason: "invalid_project_description" };
      summary.description = item.description.trim();
    }
    summaries.push(summary);
  }
  return { ok: true as const, value: summaries };
}

export function isPlainText(value: string, maxChars: number): boolean {
  if (value.length > maxChars) return false;
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return false;
  if (/\|.+\|/.test(value) && /[-:|]{3,}/.test(value)) return false;
  if (/```/.test(value)) return false;
  if (/\*\*|__|~~|`/.test(value)) return false;
  if (/\[[^\]]+\]\([^)]*\)/.test(value) || /\[[^\]]+\]/.test(value)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
