import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signMgmtToken, verifyMgmtToken } from "../src/lib/mgmtToken";

describe("mgmt token", () => {
  it("round-trips and fails closed without a secret", async () => {
    const token = await signMgmtToken({ email: "owner@example.com" }, "secret", 900, 1000);
    const ok = await verifyMgmtToken(token, "secret", 1100);
    expect(ok.ok).toBe(true);
    const body = Buffer.from(JSON.stringify({ email: "owner@example.com", exp: 1900 })).toString("base64url");
    const forged = `${body}.${createHmac("sha256", "").update(body).digest("base64url")}`;
    expect((await verifyMgmtToken(forged, "", 1100)).ok).toBe(false);
  });
});

