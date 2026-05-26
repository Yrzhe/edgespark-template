import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createHmac } from "node:crypto";

const state = vi.hoisted(() => ({
  authUser: null as null | { email: string | null },
  ownerEmail: "owner@example.com",
  mgmtSecret: "test-secret" as string | null,
  apiKeys: [] as Array<{ keyHash: string; revokedAt: number | null; id: string }>,
  lastUsedUpdates: [] as string[],
}));

vi.mock("edgespark/http", () => ({ auth: { get user() { return state.authUser; }, isAuthenticated() { return !!state.authUser; } } }));
vi.mock("edgespark", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.apiKeys }) }) }),
    update: () => ({ set: () => ({ where: async () => { state.lastUsedUpdates.push("updated"); } }) }),
  },
  vars: { get: () => state.ownerEmail },
  secret: { get: () => state.mgmtSecret },
  ctx: { environment: "production" },
}));
vi.mock("@defs", () => ({ apiKeys: { id: "id", keyHash: "keyHash" } }));

describe("managementAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    state.authUser = null;
    state.ownerEmail = "owner@example.com";
    state.mgmtSecret = "test-secret";
    state.apiKeys = [];
    state.lastUsedUpdates = [];
  });

  it("allows owner-session GET reads without bearer", async () => {
    state.authUser = { email: "owner@example.com" };
    const res = await (await authApp("GET")).request("/api/public/manage/themes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, principal: { kind: "owner" } });
  });

  it("rejects owner-session mutations without bearer", async () => {
    state.authUser = { email: "owner@example.com" };
    const res = await (await authApp("POST")).request("/api/public/manage/themes", { method: "POST" });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe("bearer_required");
  });

  it("accepts an unrevoked API key bearer", async () => {
    const { hashKey } = await import("../src/lib/keys");
    state.apiKeys = [{ id: "key_1", keyHash: await hashKey("esk_live"), revokedAt: null }];
    const res = await (await authApp("POST")).request("/api/public/manage/themes", { method: "POST", headers: { Authorization: "Bearer esk_live" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, principal: { kind: "agent", keyId: "key_1" } });
  });

  it("rejects forged owner-token mutations with not_configured when production MGMT_TOKEN_SECRET is missing", async () => {
    state.mgmtSecret = null;
    const forged = forgedEmptySecretToken({ email: "owner@example.com", exp: 9999999999 });
    const res = await (await authApp("POST")).request("/api/public/manage/themes", { method: "POST", headers: { Authorization: `Bearer ${forged}` } });
    expect(res.status).toBe(500);
    expect((await res.json() as any).error.code).toBe("not_configured");
  });

  it("rejects API-key bearer mutations with not_configured when MGMT_TOKEN_SECRET is missing", async () => {
    const { hashKey } = await import("../src/lib/keys");
    state.mgmtSecret = null;
    state.apiKeys = [{ id: "key_1", keyHash: await hashKey("esk_live"), revokedAt: null }];

    const res = await (await authApp("POST")).request("/api/public/manage/themes", { method: "POST", headers: { Authorization: "Bearer esk_live" } });

    expect(res.status).toBe(500);
    expect((await res.json() as any).error.code).toBe("not_configured");
    expect(state.lastUsedUpdates).toEqual([]);
  });
});

async function authApp(method: "GET" | "POST") {
  const { managementAuth } = await import("../src/middleware/managementAuth");
  const app = new Hono();
  app.use("/api/public/manage/*", managementAuth);
  if (method === "GET") app.get("/api/public/manage/themes", (c) => c.json({ ok: true, principal: c.get("principal") }));
  if (method === "POST") app.post("/api/public/manage/themes", (c) => c.json({ ok: true, principal: c.get("principal") }));
  return app;
}

function forgedEmptySecretToken(payload: { email: string; exp: number }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", "").update(body).digest("base64url");
  return `${body}.${sig}`;
}
