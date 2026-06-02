import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { auth } from "edgespark/http";
import { ctx, db, secret, storage, vars } from "edgespark";
import { assets } from "@defs";
import { assetRoutes } from "../src/routes/assets";
import { materializePendingAsset, reservePendingBatchAssets } from "../src/lib/imagegen/materialize";
import type { BrandStyle } from "../src/lib/imagegen/batch";

const STYLE: BrandStyle = { colors: [], typography: null, spacing: null };

describe("lazy pending asset materialization", () => {
  beforeEach(() => {
    db._reset();
    (ctx as any)._background = [];
    (storage as any)._resetPuts();
    (vars as any).values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("materializes exactly one pending batch asset to ready with bytes, image cost, and auto-description", async () => {
    const reserved = await reservePendingBatchAssets({
      userId: "owner",
      prompt: "two coral leaf stickers",
      count: 2,
      model: "gpt-image-1",
      transparent: true,
      style: STYLE,
      agentRunId: "run_batch",
    }, db);

    expect(reserved.assetIds).toHaveLength(2);
    expect((db._tables.get("assets") ?? []).every((a: any) => a.status === "generating" && a.byteSize === 0)).toBe(true);
    expect((storage as any)._puts.length).toBe(0);
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);

    const result = await materializePendingAsset(reserved.assetIds[0], db);
    expect(result.status).toBe("ready");

    const rows = db._tables.get("assets") ?? [];
    const ready = rows.find((a: any) => a.id === reserved.assetIds[0]);
    const untouched = rows.find((a: any) => a.id === reserved.assetIds[1]);
    expect(ready).toMatchObject({ status: "ready", agentRunId: "run_batch", source: "agent-gen", transparent: 1 });
    expect(ready.byteSize).toBeGreaterThan(0);
    expect(ready.s3Uri).toBe(`s3://magpie-media/assets/agent-gen/${ready.id}.png`);
    expect(untouched).toMatchObject({ status: "generating", byteSize: 0 });
    expect((storage as any)._puts).toHaveLength(1);
    expect((storage as any)._puts[0]).toMatchObject({ bucket: "magpie-media", path: `assets/agent-gen/${ready.id}.png`, contentType: "image/png" });

    const imageCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.imagegen.gpt-image-1");
    expect(imageCosts).toHaveLength(1);
    expect(imageCosts[0].agentRunId).toBe("run_batch");

    await (ctx as any)._drainBackground();
    const described = db._tables.get("assets")!.find((a: any) => a.id === ready.id);
    expect(described).toMatchObject({ descriptionSource: "llm-auto" });
    expect(typeof described.description).toBe("string");
    const visionCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.vision.describe.gpt-4o-mini");
    expect(visionCosts).toHaveLength(1);
    expect(visionCosts[0].agentRunId).toBe("run_batch");
  });

  it("uses an atomic rendering claim so concurrent materializers do not double-render or double-charge", async () => {
    const reserved = await reservePendingBatchAssets({
      userId: "owner",
      prompt: "one coral seed sticker",
      count: 1,
      model: "gpt-image-1",
      transparent: true,
      style: STYLE,
      agentRunId: "run_concurrent",
    }, db);

    const [first, second] = await Promise.all([
      materializePendingAsset(reserved.assetIds[0], db),
      materializePendingAsset(reserved.assetIds[0], db),
    ]);

    expect([first.status, second.status].sort()).toEqual(["pending", "ready"]);
    expect(db._tables.get("assets")![0].status).toBe("ready");
    expect((storage as any)._puts).toHaveLength(1);
    const imageCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.imagegen.gpt-image-1");
    expect(imageCosts).toHaveLength(1);
    expect(imageCosts[0].agentRunId).toBe("run_concurrent");

    await (ctx as any)._drainBackground();
    const visionCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.vision.describe.gpt-4o-mini");
    expect(visionCosts).toHaveLength(1);
  });

  it("GET /assets/:id materializes a pending lazy asset inline for the owner poll path", async () => {
    const reserved = await reservePendingBatchAssets({
      userId: "owner",
      prompt: "one coral sprout sticker",
      count: 1,
      model: "gpt-image-1",
      transparent: true,
      style: STYLE,
      agentRunId: "run_poll",
    }, db);

    const app = new Hono().route("/api/public", assetRoutes);
    const res = await app.request(`/api/public/assets/${reserved.assetIds[0]}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.asset).toMatchObject({ id: reserved.assetIds[0], status: "ready" });
    expect(body.asset.previewUrl).toContain("https://signed.test/");
    expect("s3Uri" in body.asset).toBe(false);
    expect((storage as any)._puts).toHaveLength(1);
    expect(db._tables.get("assets")![0].status).toBe("ready");
    const imageCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.imagegen.gpt-image-1");
    expect(imageCosts).toHaveLength(1);
  });

  it("returns pending without rendering for a non-lazy generating asset", async () => {
    db._seed(assets, [{
      id: "asset_non_lazy",
      ownerUserId: "owner",
      status: "generating",
      s3Uri: "s3://magpie-media/assets/agent-gen/asset_non_lazy.png",
      contentType: "image/png",
      byteSize: 0,
      tagsJson: "[]",
      provenanceJson: "{}",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }]);

    const result = await materializePendingAsset("asset_non_lazy", db);
    expect(result.status).toBe("pending");
    expect((storage as any)._puts).toHaveLength(0);
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);
  });
});
