import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { assets, cards } from "@defs";
import { assetRoutes, adminAssetRoutes } from "../src/routes/assets";

describe("assets v3", () => {
  beforeEach(() => {
    db._reset();
    (storage as any)._resetPuts();
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("GET /assets returns the Quill panel shape: status, presigned previewUrl, pagination, no raw s3_uri", async () => {
    db._seed(assets, [
      { id: "asset_ready", name: "Ready", ownerUserId: "owner", source: "agent-gen", status: "ready", s3Uri: "s3://magpie-media/assets/agent-gen/asset_ready.png", contentType: "image/png", byteSize: 10, transparent: 1, tagsJson: JSON.stringify(["agent-gen"]), description: "a cat", lockVersion: 0, createdAt: 2, updatedAt: 2 },
      { id: "asset_gen", name: "Generating", ownerUserId: "owner", source: "agent-gen", status: "generating", s3Uri: "s3://magpie-media/assets/agent-gen/asset_gen.png", contentType: "image/png", byteSize: 0, transparent: 1, tagsJson: "[]", lockVersion: 0, createdAt: Date.now(), updatedAt: Date.now() }, // fresh ⇒ not reconciled
      { id: "asset_del", name: "Deleted", ownerUserId: "owner", status: "ready", s3Uri: "s3://magpie-media/x.png", contentType: "image/png", byteSize: 1, tagsJson: "[]", deletedAt: 5, lockVersion: 0, createdAt: 1, updatedAt: 1 },
    ]);
    const app = new Hono().route("/api/public", assetRoutes);
    const res = await app.request("/api/public/assets?limit=10&offset=0");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toMatchObject({ limit: 10, offset: 0, total: 2 }); // soft-deleted excluded
    const ready = body.assets.find((a: any) => a.id === "asset_ready");
    const gen = body.assets.find((a: any) => a.id === "asset_gen");
    expect(ready).toMatchObject({ status: "ready", descriptionStatus: "ready", transparent: 1 });
    expect(ready.previewUrl).toContain("https://signed.test/"); // real presigned URL, M-212
    expect(ready.previewUrl).not.toContain("assets.internal"); // dead placeholder gone
    expect("s3Uri" in ready).toBe(false); // never leak raw r2/s3 uri
    expect(gen).toMatchObject({ status: "generating", descriptionStatus: "pending" });
    expect(gen.previewUrl).toBeNull(); // generating ⇒ no previewUrl (Quill: non-null ⇔ ready)
  });

  it("GET /assets/:id reconciles a stale 'generating' asset to 'failed' (M-102 layer 2)", async () => {
    const old = Date.now() - 5 * 60 * 1000; // 5 min ago, well past the 90s threshold
    db._seed(assets, [{ id: "asset_stuck", name: "Stuck", ownerUserId: "owner", source: "agent-gen", status: "generating", s3Uri: "s3://magpie-media/assets/agent-gen/asset_stuck.png", contentType: "image/png", byteSize: 0, tagsJson: "[]", provenanceJson: "{}", lockVersion: 0, createdAt: old, updatedAt: old }]);
    const app = new Hono().route("/api/public", assetRoutes);
    const res = await app.request("/api/public/assets/asset_stuck");
    const body = await res.json();
    expect(body.asset.status).toBe("failed"); // converted, not an infinite spinner
    expect(body.asset.previewUrl).toBeNull();
    expect(db._tables.get("assets")![0].status).toBe("failed"); // persisted
  });

  it("GET /assets/:id returns a real presigned previewUrl (M-212), not a dead placeholder", async () => {
    db._seed(assets, [{ id: "asset_ready", name: "Ready", ownerUserId: "owner", status: "ready", s3Uri: "s3://magpie-media/assets/agent-gen/asset_ready.png", contentType: "image/png", byteSize: 10, tagsJson: "[]", lockVersion: 0, createdAt: 1, updatedAt: 1 }]);
    const app = new Hono().route("/api/public", assetRoutes);
    const res = await app.request("/api/public/assets/asset_ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.asset.previewUrl).toContain("https://signed.test/");
    expect(body.asset.previewUrl).not.toContain("assets.internal");
  });

  it("creates folders up to three levels and rejects a fourth", async () => {
    const app = new Hono().route("/api/public", assetRoutes);
    const a = await app.request("/api/public/asset-folders", { method: "POST", body: JSON.stringify({ name: "A" }) });
    const aId = (await a.json()).id;
    const b = await app.request("/api/public/asset-folders", { method: "POST", body: JSON.stringify({ name: "B", parentFolderId: aId }) });
    const bId = (await b.json()).id;
    const c = await app.request("/api/public/asset-folders", { method: "POST", body: JSON.stringify({ name: "C", parentFolderId: bId }) });
    const cId = (await c.json()).id;
    const d = await app.request("/api/public/asset-folders", { method: "POST", body: JSON.stringify({ name: "D", parentFolderId: cId }) });
    expect(d.status).toBe(400);
  });

  it("requires double confirmation before soft deleting used assets", async () => {
    db._seed(assets, [{ id: "asset1", ownerUserId: "owner", s3Uri: "r2://magpie/a.png", contentType: "image/png", byteSize: 1, lockVersion: 0, createdAt: 1, updatedAt: 1 }]);
    db._seed(cards, [{ id: "card1", primaryAssetId: "asset1", slotAssignmentsJson: "{}", status: "ready" }]);
    const app = new Hono().route("/api/public", assetRoutes);
    const blocked = await app.request("/api/public/assets/asset1?lockVersion=0", { method: "DELETE" });
    expect(blocked.status).toBe(409);
    const ok = await app.request("/api/public/assets/asset1?confirm_used=true&confirm_retention=true&lockVersion=0", { method: "DELETE" });
    expect(ok.status).toBe(200);
    expect(db._tables.get("assets")?.[0].deletedAt).toBeTypeOf("number");
    expect(db._tables.get("assets")?.[0].purgeAfter - db._tables.get("assets")?.[0].deletedAt).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("asset PATCH returns 409 on stale lockVersion", async () => {
    db._seed(assets, [{ id: "asset1", ownerUserId: "owner", s3Uri: "r2://magpie/a.png", contentType: "image/png", byteSize: 1, lockVersion: 2, createdAt: 1, updatedAt: 1 }]);
    const app = new Hono().route("/api/public", assetRoutes);
    const res = await app.request("/api/public/assets/asset1", { method: "PATCH", body: JSON.stringify({ name: "stale", lockVersion: 1 }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("lock_version_conflict");
  });
});

describe("asset R2 garbage collection (M-213)", () => {
  beforeEach(() => {
    db._reset();
    (storage as any)._resetPuts();
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("deletes only media objects with no asset-row reference; dryRun previews without deleting", async () => {
    // Two objects referenced by live rows, two orphans (rows deleted/never existed).
    (storage as any)._seedObject("magpie-media", "assets/agent-gen/asset_keep.png");
    (storage as any)._seedObject("magpie-media", "assets/agent-gen/asset_gen.png");
    (storage as any)._seedObject("magpie-media", "assets/agent-gen/orphan_a.png");
    (storage as any)._seedObject("magpie-media", "assets/agent-gen/orphan_b.png");
    db._seed(assets, [
      { id: "asset_keep", status: "ready", s3Uri: "s3://magpie-media/assets/agent-gen/asset_keep.png", contentType: "image/png", byteSize: 1, tagsJson: "[]", lockVersion: 0, createdAt: 1, updatedAt: 1 },
      { id: "asset_gen", status: "generating", s3Uri: "s3://magpie-media/assets/agent-gen/asset_gen.png", contentType: "image/png", byteSize: 0, tagsJson: "[]", lockVersion: 0, createdAt: 1, updatedAt: 1 },
    ]);
    const app = new Hono().route("/api/public", adminAssetRoutes);

    const dry = await app.request("/api/public/admin/assets/gc?dryRun=true", { method: "POST" });
    const dryBody = await dry.json();
    expect(dryBody).toMatchObject({ scanned: 4, referenced: 2, deleted: 0, dryRun: true });
    expect(dryBody.orphans.sort()).toEqual(["assets/agent-gen/orphan_a.png", "assets/agent-gen/orphan_b.png"]);
    // dryRun must not have removed anything
    expect((storage as any)._objects.get("magpie-media").size).toBe(4);

    const real = await app.request("/api/public/admin/assets/gc", { method: "POST" });
    const realBody = await real.json();
    expect(realBody).toMatchObject({ deleted: 2, dryRun: false });
    const remaining = [...(storage as any)._objects.get("magpie-media").keys()].sort();
    expect(remaining).toEqual(["assets/agent-gen/asset_gen.png", "assets/agent-gen/asset_keep.png"]); // referenced + in-flight kept
  });

  it("is owner-only: an agent API key principal cannot reach GC", async () => {
    auth.user = undefined;
    const app = new Hono().route("/api/public", adminAssetRoutes);
    const res = await app.request("/api/public/admin/assets/gc", { method: "POST", headers: { Authorization: "Bearer esk_someagentkey" } });
    expect(res.status).toBe(401);
  });
});
