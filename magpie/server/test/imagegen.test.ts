import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { costLedger } from "@defs";
import { db, storage, vars } from "edgespark";
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
  });
});
