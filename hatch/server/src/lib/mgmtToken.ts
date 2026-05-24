/**
 * Short-lived owner management token: HMAC-SHA-256 over a base64url JSON payload.
 * The dashboard mints one after the owner logs in and sends it as `Authorization: Bearer`
 * for management mutations. `nowSec` params keep verification deterministic in tests.
 */

export interface MgmtPayload {
  email: string;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str: string): string {
  return b64url(new TextEncoder().encode(str));
}
function fromB64url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

export async function signMgmtToken(
  data: { email: string },
  secret: string,
  ttlSec: number,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<string> {
  const payload: MgmtPayload = { email: data.email, exp: nowSec + ttlSec };
  const body = b64urlStr(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifyMgmtToken(
  token: string,
  secret: string | null | undefined,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<{ ok: true; payload: MgmtPayload } | { ok: false }> {
  if (!secret) return { ok: false };
  const dot = token.indexOf(".");
  if (dot < 0) return { ok: false };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(secret, body);
  if (sig.length !== expected.length) return { ok: false };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { ok: false };
  let payload: MgmtPayload;
  try {
    payload = JSON.parse(fromB64url(body));
  } catch {
    return { ok: false };
  }
  if (typeof payload.exp !== "number" || nowSec >= payload.exp) return { ok: false };
  return { ok: true, payload };
}
