import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("edgespark", () => ({
  ctx: { environment: "production" },
  vars: { get: (name: string) => (name === "OWNER_EMAIL" ? "owner@example.com" : null) },
  secret: { get: (name: string) => (name === "MGMT_TOKEN_SECRET" ? "secret" : null) },
}), { virtual: true });

vi.mock("edgespark/http", () => ({
  auth: { user: { id: "user-2", email: "not-owner@example.com", name: "Not Owner", image: null } },
}), { virtual: true });

describe("/api/me/token", () => {
  it("rejects a logged-in non-owner with 403", async () => {
    const { meRoutes } = await import("../src/routes/me");
    const app = new Hono().route("/api", meRoutes);

    const me = await app.request("https://arena.test/api/me");
    expect(await me.json()).toMatchObject({ email: "not-owner@example.com", isOwner: false });

    const res = await app.request("https://arena.test/api/me/token");

    expect(res.status).toBe(403);
  });
});
