export interface RuntimeBindings {
  OPENAI_API_KEY?: string;
  IMAGEGEN_DAILY_BUDGET_USD?: string;
  DAILY_LLM_BUDGET_USD?: string;
}

export type VarKey = "OWNER_EMAIL" | "DAILY_LLM_BUDGET_USD" | "IMAGEGEN_DAILY_BUDGET_USD" | "PUBLIC_BASE_URL";
export type SecretKey = "OPENAI_API_KEY" | "MGMT_TOKEN_SECRET";
