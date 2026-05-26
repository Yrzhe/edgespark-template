const PREFIX = "esk_";

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export async function generateApiKey(): Promise<{ plaintext: string; prefix: string; hash: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const plaintext = PREFIX + toBase64Url(raw);
  const prefix = plaintext.slice(0, 12);
  const hash = await hashKey(plaintext);
  return { plaintext, prefix, hash };
}

export async function verifyKey(plaintext: string, expectedHash: string): Promise<boolean> {
  const actual = await hashKey(plaintext);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
