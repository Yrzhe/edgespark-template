import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("edgespark/http", () => ({ auth: { user: null } }), { virtual: true });

describe("auth-gated write routes", () => {
  it("rejects /api/vote before touching DB when no user is logged in", async () => {
    const { voteWriteRoutes } = await import("../src/routes/vote");
    const app = new Hono().route("/api", voteWriteRoutes);
    const res = await app.request("https://arena.test/api/vote", {
      method: "POST",
      body: JSON.stringify({ contestantId: "claude", count: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});
