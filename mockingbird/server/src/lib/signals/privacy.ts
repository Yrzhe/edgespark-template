import type { VisitorPrivate, VisitorPromptSafe } from "./types";

export function promptSafeVisitor(visitor: VisitorPrivate): VisitorPromptSafe {
  return { ...visitor.coarse };
}

export function assertNoPreciseFieldsSerialized(serialized: string, preciseKeys: readonly string[]): void {
  for (const key of preciseKeys) {
    if (serialized.includes(`"${key}"`)) throw new Error(`precise field leaked: ${key}`);
  }
}

export function safePromptJson(visitor: VisitorPrivate): string {
  const json = JSON.stringify(promptSafeVisitor(visitor));
  assertNoPreciseFieldsSerialized(json, Object.keys(visitor.precise));
  return json;
}
