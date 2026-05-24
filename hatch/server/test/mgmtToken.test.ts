import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signMgmtToken, verifyMgmtToken } from "../src/lib/mgmtToken";

const SECRET = "test-secret-please-rotate";

describe("mgmt token", () => {
  it("round-trips a valid token", async () => {
    const tok = await signMgmtToken({ email: "owner@x.com" }, SECRET, 900, 1000);
    const res = await verifyMgmtToken(tok, SECRET, 1100);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload.email).toBe("owner@x.com");
  });

  it("rejects expired", async () => {
    const tok = await signMgmtToken({ email: "owner@x.com" }, SECRET, 900, 1000);
    const res = await verifyMgmtToken(tok, SECRET, 1000 + 901);
    expect(res.ok).toBe(false);
  });

  it("rejects tampered signature", async () => {
    const tok = await signMgmtToken({ email: "owner@x.com" }, SECRET, 900, 1000);
    const res = await verifyMgmtToken(tok + "x", SECRET, 1100);
    expect(res.ok).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const tok = await signMgmtToken({ email: "owner@x.com" }, SECRET, 900, 1000);
    const res = await verifyMgmtToken(tok, "other-secret", 1100);
    expect(res.ok).toBe(false);
  });

  it("rejects tokens forged with an empty secret", async () => {
    const body = Buffer.from(JSON.stringify({ email: "owner@x.com", exp: 1900 })).toString("base64url");
    const sig = createHmac("sha256", "").update(body).digest("base64url");
    const forged = `${body}.${sig}`;
    const res = await verifyMgmtToken(forged, "", 1100);
    expect(res.ok).toBe(false);
  });
});
