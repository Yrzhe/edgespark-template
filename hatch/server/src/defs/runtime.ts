// Typed runtime input keys for app code.
// VarKey and SecretKey are string literal union types, not values or config storage.
// Values come from .env.local in local dev and remote vars/secrets in deployed envs.

export type VarKey =
  | "OWNER_EMAIL"; // the single owner's login email; gates the management API

export type SecretKey =
  | "MGMT_TOKEN_SECRET"; // HMAC signing key for short-lived owner management tokens
