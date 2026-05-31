import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { events } from "@defs";
import { logEvent } from "../src/lib/events";
import { manageRoutes } from "../src/routes/manage";
import { requireApprovedUser } from "../src/middleware/managementAuth";

describe("admin events", () => {
  beforeEach(() => {
    db._reset();
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("lists and filters owner-visible events", async () => {
    db._seed(events, [
      { id: "evt1", level: "info", code: "signup", message: "created", userId: "u1", route: "/api/me", metaJson: "{}", createdAt: 10 },
      { id: "evt2", level: "error", code: "unhandled", message: "boom", userId: null, route: "/api/public/cards", metaJson: "{}", createdAt: 20 },
      { id: "evt3", level: "warn", code: "cost_429", message: "budget", userId: "u2", route: "/api/public/imagegen", metaJson: "{}", createdAt: 30 },
    ]);
    const app = new Hono().route("/api/public/manage", manageRoutes);
    const res = await app.request("/api/public/manage/events?level=warn&since=25&limit=50");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ id: "evt3", code: "cost_429" });
    const detail = await app.request("/api/public/manage/events/evt2");
    expect(detail.status).toBe(200);
    expect((await detail.json()).event.message).toBe("boom");
  });

  it("sanitizes event metadata secrets", async () => {
    await logEvent("audit", "test", "ok", { userId: "u1", meta: { token: "secret", nested: { password: "pw", keep: "visible" } } });
    const [row] = await db.select().from(events);
    expect(JSON.parse(row.metaJson)).toEqual({ token: "[redacted]", nested: { password: "[redacted]", keep: "visible" } });
  });

  it("logs auth_denied from requireApprovedUser", async () => {
    auth.user = null;
    const app = new Hono().use("*", requireApprovedUser).get("/private", (c) => c.json({ ok: true }));
    const res = await app.request("/private");
    expect(res.status).toBe(401);
    await Promise.resolve();
    const rows = await db.select().from(events);
    expect(rows.some((row) => row.level === "audit" && row.code === "auth_denied" && row.message === "unauthorized")).toBe(true);
  });
});
