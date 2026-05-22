import { describe, it, expect } from "vitest";
import { generateApiKey, hashKey, verifyKey } from "../src/lib/keys";

describe("api keys", () => {
  it("generates a prefixed key whose hash verifies", async () => {
    const { plaintext, prefix, hash } = await generateApiKey();
    expect(plaintext.startsWith("esk_")).toBe(true);
    expect(plaintext.length).toBeGreaterThan(40); // 32 bytes base64url (~43) + 'esk_'
    expect(prefix).toBe(plaintext.slice(0, 12));
    expect(hash).toHaveLength(64); // SHA-256 hex
    expect(await verifyKey(plaintext, hash)).toBe(true);
  });

  it("rejects a wrong key", async () => {
    const { hash } = await generateApiKey();
    expect(await verifyKey("esk_wrongwrongwrong", hash)).toBe(false);
  });

  it("hashKey is deterministic", async () => {
    expect(await hashKey("esk_sample")).toBe(await hashKey("esk_sample"));
  });
});
