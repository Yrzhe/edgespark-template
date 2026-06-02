const TOKEN_PREFIX = "wrn_live_";

function toBase64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export async function generateAgentToken(): Promise<{ plaintext: string; prefix: string; hash: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const plaintext = TOKEN_PREFIX + toBase64Url(raw);
  return {
    plaintext,
    prefix: plaintext.slice(0, 16),
    hash: await sha256Hex(plaintext),
  };
}

export function hasAgentTokenShape(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length > TOKEN_PREFIX.length + 20;
}

export async function constantTimeEqualSha256(actual: string, expected: string): Promise<boolean> {
  const actualHash = await sha256Hex(actual);
  const expectedHash = await sha256Hex(expected);
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
