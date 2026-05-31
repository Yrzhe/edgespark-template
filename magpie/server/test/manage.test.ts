import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { brandRuleVersions } from "@defs";
import { manageRoutes } from "../src/routes/manage";

describe("manage routes", () => {
  beforeEach(() => {
    db._reset();
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("patchRow returns 409 on stale lockVersion", async () => {
    db._seed(brandRuleVersions, [{ id: "rule1", family: "bloome", version: 1, active: 1, rulesJson: "[]", lockVersion: 2, createdAt: 1, updatedAt: 2 }]);
    const app = new Hono().route("/api/public/manage", manageRoutes);
    const res = await app.request("/api/public/manage/rules/rule1", {
      method: "PATCH",
      body: JSON.stringify({ lockVersion: 1, ownerNotes: "stale" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("lock_version_conflict");
  });
});
