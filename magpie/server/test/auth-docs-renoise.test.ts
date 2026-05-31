import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { apiKeys, teamProfiles } from "@defs";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { buildLlmsTxt } from "../src/lib/llms";
import { hashKey } from "../src/lib/keys";
import { signMgmtToken } from "../src/lib/mgmtToken";
import { getMgmtSecret } from "../src/lib/ownerConfig";
import { approvedUserOrAgentKey, ownerSessionOrOwnerToken } from "../src/middleware/managementAuth";

describe("management auth and docs", () => {
  it("accepts owner session for management and never treats API keys as owner", async () => {
    auth.user = { id: "owner", email: "owner@youware.com" };
    const app = new Hono().use("*", ownerSessionOrOwnerToken).post("/mutate", (c) => c.json({ ok: true, principal: c.get("principal") }));
    const res = await app.request("/mutate", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).principal.kind).toBe("owner");
    db._reset();
    db._seed(apiKeys, [{ id: "key1", keyHash: await hashKey("esk_test"), prefix: "esk_test", createdBy: "u1", revokedAt: null }]);
    const keyRes = await app.request("/mutate", { method: "POST", headers: { Authorization: "Bearer esk_test" } });
    expect(keyRes.status).toBe(401);
  });

  it("accepts a signed owner management token", async () => {
    const token = await signMgmtToken({ email: "owner@youware.com" }, getMgmtSecret()!, 60);
    const app = new Hono().use("*", ownerSessionOrOwnerToken).post("/mutate", (c) => c.json({ ok: true, principal: c.get("principal") }));
    const res = await app.request("/mutate", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect((await res.json()).principal.kind).toBe("owner");
  });

  it("accepts approved role=owner profiles for management even when email differs from OWNER_EMAIL", async () => {
    auth.user = { id: "owner2", email: "batch-r-owner@youware.com" };
    db._reset();
    db._seed(teamProfiles, [{ userId: "owner2", email: "batch-r-owner@youware.com", approvalStatus: "approved", role: "owner", createdAt: 1, updatedAt: 1 }]);
    const app = new Hono().use("*", ownerSessionOrOwnerToken).get("/manage", (c) => c.json({ principal: c.get("principal") }));
    const res = await app.request("/manage");
    expect(res.status).toBe(200);
    expect((await res.json()).principal.kind).toBe("owner");
  });


  it("accepts API keys and exposes Magpie llms.txt constraints", async () => {
    db._reset();
    db._seed(apiKeys, [{ id: "key1", keyHash: await hashKey("esk_test"), prefix: "esk_test", createdBy: "u1", revokedAt: null }]);
    const app = new Hono().use("*", approvedUserOrAgentKey).get("/read", (c) => c.json({ principal: c.get("principal") }));
    const res = await app.request("/read", { headers: { Authorization: "Bearer esk_test" } });
    expect(res.status).toBe(200);
    expect((await res.json()).principal.kind).toBe("agent");
    expect(buildLlmsTxt("https://magpie.example")).toContain("cards.save must include agentRunId");
    expect(buildLlmsTxt("https://magpie.example")).toContain("/api/public/manage/rules");
  });

});
