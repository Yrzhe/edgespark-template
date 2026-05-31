import { ctx, secret, vars } from "edgespark";

const DEV_MGMT_SECRET = "dev-insecure-mgmt-token-secret";

export function isDevEnv(): boolean {
  return (ctx.environment as string) === "dev";
}

export function getOwnerEmail(): string | null {
  return vars.get("OWNER_EMAIL");
}

export function getMgmtSecret(): string | null {
  return secret.get("MGMT_TOKEN_SECRET") ?? (isDevEnv() ? DEV_MGMT_SECRET : null);
}

export function getDailyBudgetUsd(): number {
  const raw = vars.get("DAILY_LLM_BUDGET_USD") ?? "5";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getOpenAiApiKey(): string | null {
  return secret.get("OPENAI_API_KEY") ?? (isDevEnv() ? process.env.OPENAI_API_KEY ?? null : null);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  const configured = getOwnerEmail();
  if (configured) return email === configured;
  return isDevEnv() && !!email;
}
