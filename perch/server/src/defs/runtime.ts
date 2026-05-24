// Typed runtime input keys for app code.
// Values come from remote vars/secrets in deployed envs. Local dev falls back
// only where lib/ownerConfig.ts explicitly permits it.

export type VarKey =
  | "OWNER_EMAIL"; // the single owner's login email; gates the management API

export type SecretKey =
  | "MGMT_TOKEN_SECRET"; // HMAC signing key for short-lived owner management tokens
