import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { signupWhitelist, teamProfiles } from "@defs";
import { publicRoutes } from "../src/routes/public";
import { meRoutes } from "../src/routes/me";
import { manageRoutes } from "../src/routes/manage";

describe("signup whitelist", () => {
  beforeEach(() => {
    db._reset();
    auth.user = null;
  });

  it("allows signup-check for a whitelisted domain", async () => {
    const app = new Hono().route("/api/public", publicRoutes);
    const res = await app.request("/api/public/signup-check", {
      method: "POST",
      body: JSON.stringify({ email: "member@youware.com" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true });
  });

  it("rejects signup-check for a non-whitelisted domain", async () => {
    const app = new Hono().route("/api/public", publicRoutes);
    const res = await app.request("/api/public/signup-check", {
      method: "POST",
      body: JSON.stringify({ email: "member@example.com" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("signup_not_whitelisted");
  });

  it("auto-creates a real approved owner profile on first /api/me", async () => {
    auth.user = { id: "owner", email: "owner@youware.com", name: "Yrzhe" };
    const app = new Hono().route("/api/me", meRoutes);
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ userId: "owner", email: "owner@youware.com", role: "owner", approvalStatus: "approved" });
    const profiles = await db.select().from(teamProfiles);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ userId: "owner", role: "owner", approvalStatus: "approved" });
  });

  it("auto-creates a pending member profile for whitelisted non-owners on first /api/me", async () => {
    auth.user = { id: "member1", email: "member@youware.com", name: "Member One" };
    const app = new Hono().route("/api/me", meRoutes);
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ userId: "member1", email: "member@youware.com", role: "member", approvalStatus: "pending" });
    const profiles = await db.select().from(teamProfiles);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ userId: "member1", role: "member", approvalStatus: "pending" });
  });

  it("lets owners manage whitelist rows", async () => {
    auth.user = { id: "owner", email: "owner@youware.com" };
    const app = new Hono().route("/api/public/manage", manageRoutes);
    const create = await app.request("/api/public/manage/whitelist", {
      method: "POST",
      body: JSON.stringify({ kind: "email", value: "Friend@Example.com" }),
    });
    expect(create.status).toBe(201);
    const { id } = await create.json();
    const rows = await db.select().from(signupWhitelist);
    expect(rows.some((row) => row.kind === "email" && row.value === "friend@example.com" && row.active === 1)).toBe(true);
    const del = await app.request(`/api/public/manage/whitelist/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await db.select().from(signupWhitelist)).some((row) => row.id === id && row.active === 0)).toBe(true);
  });
});
