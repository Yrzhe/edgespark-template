import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHmac } from "node:crypto";

// TODO(scaffold): copy into `server/test/managementAuth.test.ts` after generated
// Perch `@defs` and EdgeSpark SDK path aliases exist. These mocks mirror Hatch's
// managementAuth contract without needing a real EdgeSpark runtime.

const state = vi.hoisted(() => ({
  authUser: null as null | { email: string | null },
  ownerEmail: "owner@example.com",
  mgmtSecret: "test-secret" as string | null,
  apiKeys: [] as Array<{ keyHash: string; revokedAt: number | null; id: string }>,
  lastUsedUpdates: [] as string[],
}));

vi.mock("edgespark/http", () => ({
  auth: {
    get user() {
      return state.authUser;
    },
    isAuthenticated() {
      return !!state.authUser;
    },
  },
}));

vi.mock("edgespark", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.apiKeys,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: async (_where: unknown) => {
          state.lastUsedUpdates.push("updated");
        },
      }),
    }),
  },
  vars: { get: () => state.ownerEmail },
  secret: { get: () => state.mgmtSecret },
  ctx: { environment: "production" },
}));

vi.mock("@defs", () => ({
  apiKeys: {
    id: "id",
    keyHash: "keyHash",
  },
}));

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
    const app = await authApp("GET");

    const res = await app.request("/api/public/manage/pages");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, principal: { kind: "owner" } });
  });

  it("rejects owner-session mutations without bearer", async () => {
    state.authUser = { email: "owner@example.com" };
    const app = await authApp("POST");

    const res = await app.request("/api/public/manage/pages", { method: "POST" });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("bearer_required");
  });

  it("accepts an unrevoked API key bearer", async () => {
    const { hashKey } = await import("../src/lib/keys");
    state.apiKeys = [{ id: "key_1", keyHash: await hashKey("esk_live"), revokedAt: null }];
    const app = await authApp("POST");

    const res = await app.request("/api/public/manage/pages", {
      method: "POST",
      headers: { Authorization: "Bearer esk_live" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, principal: { kind: "agent", keyId: "key_1" } });
    expect(state.lastUsedUpdates).toEqual(["updated"]);
  });

  it("rejects a revoked API key bearer", async () => {
    const { hashKey } = await import("../src/lib/keys");
    state.apiKeys = [{ id: "key_1", keyHash: await hashKey("esk_revoked"), revokedAt: 123 }];
    const app = await authApp("GET");

    const res = await app.request("/api/public/manage/pages", {
      headers: { Authorization: "Bearer esk_revoked" },
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("rejects a forged owner token when production MGMT_TOKEN_SECRET is missing", async () => {
    state.ownerEmail = "owner@example.com";
    state.mgmtSecret = null;
    const forged = forgedEmptySecretToken({ email: "owner@example.com", exp: 1900 });
    const app = await authApp("POST");

    const res = await app.request("/api/public/manage/pages", {
      method: "POST",
      headers: { Authorization: `Bearer ${forged}` },
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("invalid_credentials");
  });
});

async function authApp(method: "GET" | "POST") {
  const { managementAuth } = await import("../src/middleware/managementAuth");
  const app = new Hono();
  app.use("/api/public/manage/*", managementAuth);
  if (method === "GET") app.get("/api/public/manage/pages", (c) => c.json({ ok: true, principal: c.get("principal") }));
  if (method === "POST") app.post("/api/public/manage/pages", (c) => c.json({ ok: true, principal: c.get("principal") }));
  return app;
}

function forgedEmptySecretToken(payload: { email: string; exp: number }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", "").update(body).digest("base64url");
  return `${body}.${sig}`;
}
