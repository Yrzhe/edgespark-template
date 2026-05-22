export type ReadRule = "public" | "private";
export type WriteRule = "public-append" | "public" | "private";

export interface BaaSRuleInput {
  read: unknown;
  write: unknown;
}

export interface BaaSRules {
  read: ReadRule;
  write: WriteRule;
}

const READ_RULES = new Set<ReadRule>(["public", "private"]);
const WRITE_RULES = new Set<WriteRule>(["public-append", "public", "private"]);

export function canRead(rule: ReadRule): boolean {
  return rule === "public";
}

export function canCreate(rule: WriteRule): boolean {
  return rule === "public-append" || rule === "public";
}

export function canModify(rule: WriteRule): boolean {
  return rule === "public";
}

export function assertValidRules(input: BaaSRuleInput): BaaSRules {
  if (!READ_RULES.has(input.read as ReadRule)) {
    throw new Error("Invalid BaaS read rule");
  }
  if (!WRITE_RULES.has(input.write as WriteRule)) {
    throw new Error("Invalid BaaS write rule");
  }
  return { read: input.read as ReadRule, write: input.write as WriteRule };
}
