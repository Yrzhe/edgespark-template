/**
 * Owner-config resolution, shared by the token-mint route and the management gate so
 * they always agree on "who is the owner" and "which secret signs/verifies tokens".
 *
 * Local `edgespark dev` does NOT inject platform vars/secrets, so `OWNER_EMAIL` and
 * `MGMT_TOKEN_SECRET` are absent there. To keep the dashboard usable out-of-the-box
 * after a plain `edgespark dev`, we fall back to dev defaults — but ONLY when
 * `ctx.environment === "dev"`. Production/staging always use the real configured values.
 *
 * Fail-secure: the relaxation is gated on the dev environment, never on "config missing".
 * A misconfigured production (no OWNER_EMAIL) therefore LOCKS the dashboard — nobody can
 * mint an owner token — rather than granting owner access to any logged-in user.
 *
 * Note: these read `ctx`/`vars`/`secret`, so call them only from inside route handlers
 * or middleware (never at module top level).
 */
import { vars, secret, ctx } from "edgespark";

// Used only when ctx.environment === "dev"; never signs/verifies anything in prod.
const DEV_MGMT_SECRET = "dev-insecure-mgmt-token-secret";

export function isDevEnv(): boolean {
  // The generated DeploymentEnv type is "production" | "staging", but the local dev
  // runtime reports "dev" — compare via string to detect it.
  return (ctx.environment as string) === "dev";
}

export function getOwnerEmail(): string | null {
  return vars.get("OWNER_EMAIL");
}

/** Effective HMAC secret for signing/verifying owner tokens (dev fallback only in dev). */
export function getMgmtSecret(): string | null {
  return secret.get("MGMT_TOKEN_SECRET") ?? (isDevEnv() ? DEV_MGMT_SECRET : null);
}

/**
 * Is `email` the owner? When OWNER_EMAIL is configured it must match exactly. In dev
 * with no OWNER_EMAIL set, any logged-in user is treated as the owner.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const configured = getOwnerEmail();
  if (configured) return email === configured;
  return isDevEnv() && !!email;
}
