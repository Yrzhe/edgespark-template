import { getMgmtSecret } from "./ownerConfig";
import { signMgmtToken, verifyMgmtToken } from "./mgmtToken";

const PREFIX = "preview:";

export async function signPreviewToken(input: { signals: unknown; ttlSec: number }): Promise<string | null> {
  const secret = getMgmtSecret();
  if (!secret) return null;
  return signMgmtToken({ email: PREFIX + b64(JSON.stringify(input.signals)) }, secret, input.ttlSec);
}

export async function verifyPreviewToken(token: string): Promise<{ ok: true; signals: unknown } | { ok: false }> {
  const secret = getMgmtSecret();
  const verified = await verifyMgmtToken(token, secret);
  if (!verified.ok || !verified.payload.email.startsWith(PREFIX)) return { ok: false };
  try {
    return { ok: true, signals: JSON.parse(unb64(verified.payload.email.slice(PREFIX.length))) };
  } catch {
    return { ok: false };
  }
}

function b64(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
}
