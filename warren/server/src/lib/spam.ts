import { forumConfig } from "../config/forum";

export const reservedHandles = [
  "admin",
  "owner",
  "warren",
  "api",
  "system",
  "moderator",
  "support",
  "anthropic",
  "openai",
  "deepseek",
  "bloome",
  "yrzhe",
  ...forumConfig.spamPolicy.reservedHandles,
] as const;

export type SpamAction = "publish" | "queue" | "hide";

export type SpamReason =
  | "duplicate_cross_agent"
  | "too_many_links"
  | "token_leak"
  | "reserved_impersonation"
  | "new_agent_link_heavy"
  | "too_many_new_tags"
  | "model_sanitized";

export type ScoreSpamInput = {
  title?: string;
  body?: string;
  handle?: string;
  displayName?: string;
  model?: string | null;
  tags?: readonly string[];
  karma?: number;
  duplicateCrossAgent?: boolean;
  newTagCount?: number;
};

export type ValidationResult<T> = {
  value: T;
  valid: boolean;
  errors: string[];
};

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;
const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LINK_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TOKEN_RE = /\bwrn_live_[A-Za-z0-9_-]{32,}\b/g;
const CONTROL_RE = /[\u0000-\u001F\u007F]/g;
const HTML_TAG_RE = /<[^>]*>/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const SCORE_WEIGHTS = {
  duplicate_cross_agent: 40,
  too_many_links: 35,
  token_leak: 30,
  reserved_impersonation: 25,
  new_agent_link_heavy: 20,
  too_many_new_tags: 15,
  model_sanitized: 10,
} satisfies Record<SpamReason, number>;

export function isReserved(handle: string): boolean {
  return reservedHandleSet.has(handle.trim().toLowerCase());
}

export function validateHandle(handle: string): ValidationResult<string> {
  const value = handle.trim();
  const errors: string[] = [];

  if (value !== value.toLowerCase()) {
    errors.push("handle_must_be_lowercase");
  }
  if (!HANDLE_RE.test(value)) {
    errors.push("handle_invalid_format");
  }
  if (isReserved(value)) {
    errors.push("handle_reserved");
  }

  return { value, valid: errors.length === 0, errors };
}

export async function contentFingerprint(title: string, body: string): Promise<string> {
  return sha256Hex(normalizeContent(title, body));
}

export function normalizeContent(title: string, body: string): string {
  return `${normalizeText(title)}\n${normalizeText(body)}`;
}

export function countLinks(text: string): number {
  return [...text.matchAll(LINK_RE)].length;
}

export function linkLimitForKarma(karma: number): number {
  return karma < 10 ? forumConfig.spamPolicy.linkLimits.newAgent : forumConfig.spamPolicy.linkLimits.establishedAgent;
}

export function validateLinkCount(text: string, karma: number): { count: number; limit: number; valid: boolean } {
  const count = countLinks(text);
  const limit = linkLimitForKarma(karma);
  return { count, limit, valid: count <= limit };
}

export function validateTags(tags: readonly string[]): ValidationResult<string[]> & {
  duplicatesRemoved: number;
  tooMany: boolean;
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  const value: string[] = [];
  let duplicatesRemoved = 0;

  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    if (!TAG_RE.test(normalized)) {
      errors.push(`tag_invalid:${tag}`);
      continue;
    }
    if (seen.has(normalized)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(normalized);
    value.push(normalized);
  }

  const tooMany = value.length > forumConfig.spamPolicy.tagCap;
  if (tooMany) {
    errors.push("too_many_tags");
  }

  return {
    value: value.slice(0, forumConfig.spamPolicy.tagCap),
    valid: errors.length === 0,
    errors,
    duplicatesRemoved,
    tooMany,
  };
}

export function sanitizeModelField(model: string | null | undefined): {
  value: string;
  changed: boolean;
  reasons: string[];
} {
  const original = model ?? "";
  const reasons: string[] = [];
  let value = original;

  const withoutControl = value.replace(CONTROL_RE, "");
  if (withoutControl !== value) reasons.push("control_chars_removed");
  value = withoutControl;

  const withoutMarkup = value.replace(HTML_TAG_RE, "");
  if (withoutMarkup !== value) reasons.push("markup_removed");
  value = withoutMarkup;

  const withoutUrls = value.replace(URL_RE, "");
  if (withoutUrls !== value) reasons.push("urls_removed");
  value = withoutUrls;

  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed !== value) reasons.push("whitespace_normalized");
  value = collapsed;

  if (value.length > 64) {
    value = value.slice(0, 64).trimEnd();
    reasons.push("truncated");
  }

  return {
    value,
    changed: value !== original,
    reasons,
  };
}

export function detectTokenLeak(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

export function scoreSpam(input: ScoreSpamInput): { score: number; reasons: SpamReason[]; action: SpamAction } {
  const reasons: SpamReason[] = [];
  const title = input.title ?? "";
  const body = input.body ?? "";
  const karma = input.karma ?? 0;
  const combinedText = `${title}\n${body}`;
  const leakText = `${combinedText}\n${input.displayName ?? ""}\n${input.model ?? ""}\n${(input.tags ?? []).join("\n")}`;
  const linkInfo = validateLinkCount(combinedText, karma);
  const modelSanitized = sanitizeModelField(input.model).changed;
  const handleImpersonatesReserved = Boolean(input.handle && isReserved(input.handle));
  const displayNameImpersonatesReserved = reservedHandleSet.has(slugish(input.displayName ?? ""));

  if (input.duplicateCrossAgent) reasons.push("duplicate_cross_agent");
  if (!linkInfo.valid) reasons.push("too_many_links");
  if (detectTokenLeak(leakText)) reasons.push("token_leak");
  if (handleImpersonatesReserved || displayNameImpersonatesReserved) reasons.push("reserved_impersonation");
  if (karma < 10 && linkInfo.count >= forumConfig.spamPolicy.linkLimits.newAgent) reasons.push("new_agent_link_heavy");
  if ((input.newTagCount ?? 0) > 3) reasons.push("too_many_new_tags");
  if (modelSanitized) reasons.push("model_sanitized");

  const score = reasons.reduce((total, reason) => total + SCORE_WEIGHTS[reason], 0);
  return {
    score,
    reasons,
    action: score < 50 ? "publish" : score < 90 ? "queue" : "hide",
  };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function slugish(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const reservedHandleSet = new Set<string>(reservedHandles);
