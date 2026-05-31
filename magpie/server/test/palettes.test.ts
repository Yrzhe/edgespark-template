import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { paletteRoutes, managePaletteRoutes } from "../src/routes/palettes";

describe("palettes", () => {
  beforeEach(() => {
    db._reset();
  });

  it("seeds Bloome canonical and blocks locked deletion", async () => {
    auth.user = { id: "owner", email: "owner@youware.com" };
    const app = new Hono().route("/api/public", paletteRoutes).route("/api/public/manage", managePaletteRoutes);
    const list = await app.request("/api/public/palettes");
    expect(list.status).toBe(200);
    const canonical = (await list.json()).palettes[0];
    expect(canonical.locked).toBe(1);

    auth.user = { id: "owner", email: "owner@youware.com" };
    const del = await app.request(`/api/public/manage/palettes/${canonical.id}`, { method: "DELETE" });
    expect(del.status).toBe(409);
  });
});
