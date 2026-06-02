import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { assets, costLedger } from "@defs";
import { db, secret, storage, vars } from "edgespark";
import { auth } from "edgespark/http";
import { buildImagegenPrompt, imagegenCreate, inferMode } from "../src/lib/imagegen/openai";
import { canonicalPaletteRow } from "../src/lib/palettes";
import * as autotag from "../src/lib/description/autotag";
import { imagegenRoutes } from "../src/routes/imagegen";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv3CJwAAAABJRU5ErkJggg==";

describe("imagegen", () => {
  beforeEach(() => db._reset());

  it("branches transparent and opaque modes from intent", () => {
    expect(inferMode("small sticker icon", { width: 1024, height: 1024 })).toBe("transparent");
    expect(inferMode("hero poster composition", { width: 1080, height: 1350 })).toBe("opaque");
    const prompt = buildImagegenPrompt("sprout badge", "transparent", canonicalPaletteRow());
    expect(prompt).toContain("background, isolated subject");
    expect(prompt).toContain("#2556B6");
    expect(prompt).toContain("No purple/violet gradients");
  });

  it("runs cost guard before requiring OpenAI credentials", async () => {
    db._seed(costLedger, [{ userId: "u1", costMicros: 20_000, occurredAt: Date.now() }]);
    await expect(imagegenCreate({ prompt: "poster", dims: { width: 1088, height: 1920 }, mode: "opaque", userId: "u1" })).rejects.toMatchObject({ status: 429 });
  });

  describe("POST /imagegen route", () => {
    beforeEach(() => {
      (storage as any)._resetPuts();
      auth.user = { id: "owner", email: "owner@youware.com" };
      (vars as any).values.set("DAILY_LLM_BUDGET_USD", "5");
      vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
      );
      // No-op the background describe so no presign/vision chain leaks past teardown.
      vi.spyOn(autotag, "triggerAssetDescription").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
      (secret as any).values.delete("OPENAI_API_KEY");
      (vars as any).values.set("DAILY_LLM_BUDGET_USD", "0.02");
      auth.user = undefined;
    });

    it("persists the generated png to R2, stores a canonical s3 uri, and fires auto-description", async () => {
      const app = new Hono().route("/api/public", imagegenRoutes);
      const res = await app.request("/api/public/imagegen", {
        method: "POST",
        body: JSON.stringify({ prompt: "coral badge", dims: { width: 1024, height: 1024 }, mode: "transparent" }),
      });
      expect(res.status).toBe(201);

      const puts = (storage as any)._puts;
      expect(puts.length).toBe(1);
      expect(puts[0].bucket).toBe("magpie-media");
      expect(puts[0].contentType).toBe("image/png");
      expect(puts[0].size).toBeGreaterThan(0);

      const row = db._tables.get("assets")![0];
      expect(String(row.s3Uri).startsWith("s3://magpie-media/assets/agent-gen/")).toBe(true);
      expect((autotag.triggerAssetDescription as any)).toHaveBeenCalledTimes(1);
    });

    it("accepts caller-owned referenceAssetIds and passes R2 bytes to the OpenAI edits path", async () => {
      (secret as any).values.set("OPENAI_API_KEY", "sk-test");
      (storage as any)._seedObject("magpie-media", "assets/uploads/ref.png", 9, new Date(0), "image/png");
      db._seed(assets, [{
        id: "asset_ref",
        ownerUserId: "owner",
        status: "ready",
        source: "upload",
        name: "Reference",
        s3Uri: "s3://magpie-media/assets/uploads/ref.png",
        contentType: "image/png",
        byteSize: 9,
        tagsJson: "[]",
        createdAt: 1,
        updatedAt: 1,
      }]);
      let requestUrl = "";
      let requestInit: RequestInit | null = null;
      vi.mocked(globalThis.fetch).mockImplementationOnce(async (url, init) => {
        requestUrl = String(url);
        requestInit = init ?? null;
        return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
      });

      const app = new Hono().route("/api/public", imagegenRoutes);
      const res = await app.request("/api/public/imagegen", {
        method: "POST",
        body: JSON.stringify({ prompt: "same style coral badge", dims: { width: 1024, height: 1024 }, mode: "opaque", referenceAssetIds: ["asset_ref"] }),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).model).toBe("gpt-image-1");
      expect(requestUrl).toBe("https://api.openai.com/v1/images/edits");
      const form = requestInit?.body as FormData;
      expect(form.get("model")).toBe("gpt-image-1");
      expect(form.get("input_fidelity")).toBe("high");
      expect(form.getAll("image")).toHaveLength(1);
      const row = db._tables.get("assets")!.find((a: any) => a.id !== "asset_ref");
      expect(JSON.parse(row.provenanceJson).referenceAssetIds).toEqual(["asset_ref"]);
      expect((autotag.triggerAssetDescription as any)).toHaveBeenCalledTimes(1);
    });

    it("rejects a referenceAssetId owned by a different library before calling the model", async () => {
      db._seed(assets, [{
        id: "asset_foreign",
        ownerUserId: "other",
        status: "ready",
        s3Uri: "s3://magpie-media/assets/uploads/foreign.png",
        contentType: "image/png",
        byteSize: 4,
        tagsJson: "[]",
        createdAt: 1,
        updatedAt: 1,
      }]);
      const app = new Hono().route("/api/public", imagegenRoutes);
      const res = await app.request("/api/public/imagegen", {
        method: "POST",
        body: JSON.stringify({ prompt: "copy this style", dims: { width: 1024, height: 1024 }, referenceAssetIds: ["asset_foreign"] }),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("reference_asset_forbidden");
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect((storage as any)._puts).toHaveLength(0);
    });
  });
});
