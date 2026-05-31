import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { db, storage, vars } from "edgespark";
import { auth } from "edgespark/http";
import { brandRuleVersions, cards, costLedger } from "@defs";
import {
  MAX_BATCH_COUNT,
  buildStyleInheritancePrefix,
  extractBrandStyle,
  resolveCardStyle,
  runBatchImagegen,
  validateBatchInput,
} from "../src/lib/imagegen/batch";
import { imagegenBatchRoutes } from "../src/routes/imagegenBatch";

// The batch fires gpt-4o-mini auto-description in the background (fire-and-forget). Stub the whole
// trigger to a no-op so no background presign/describe chain leaks after the test (and its mocks)
// tear down. The synchronous flow under test — byte upload, asset rows, cost rows — is unaffected.
vi.mock("../src/lib/description/autotag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/description/autotag")>();
  return { ...actual, triggerAssetDescription: vi.fn() };
});

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv3CJwAAAABJRU5ErkJggg==";

describe("imagegen batch", () => {
  beforeEach(() => {
    db._reset();
    (storage as any)._resetPuts();
    auth.user = { id: "owner", email: "owner@youware.com" };
    // Default test budget (0.02 USD) is below a single image; raise it so batches fit.
    (vars as any).values.set("DAILY_LLM_BUDGET_USD", "5");
    // Deterministic image responses. Must build a FRESH Response per call — a single shared
    // Response body can only be read once, which would fail every concurrent call after the first.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }], choices: [{ message: { content: "a coral test asset" } }] }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (vars as any).values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("validates prompt, count bounds, and model", () => {
    expect(validateBatchInput({ prompt: "x", count: 3, model: "gpt-image-1" }).ok).toBe(true);
    expect(MAX_BATCH_COUNT).toBe(6);

    const tooMany = validateBatchInput({ prompt: "x", count: 7, model: "gpt-image-1" });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.code).toBe("count_exceeded");

    expect(validateBatchInput({ prompt: "x", count: 2, model: "dall-e-3" }).ok).toBe(false);
    expect(validateBatchInput({ prompt: "", count: 2, model: "gpt-image-1" }).ok).toBe(false);
    expect(validateBatchInput({ prompt: "x", count: 0, model: "gpt-image-1" }).ok).toBe(false);
  });

  it("extracts brand style from a card spec and injects it into the prompt prefix", () => {
    const style = extractBrandStyle({ cardSpecJson: JSON.stringify({ colors: ["#2556B6", "#F36440"], typography: "Söhne", spacing: "airy" }) });
    expect(style.colors).toEqual(["#2556B6", "#F36440"]);
    expect(style.typography).toBe("Söhne");
    expect(style.spacing).toBe("airy");

    const prefix = buildStyleInheritancePrefix(style);
    expect(prefix).toContain("in the style of palette #2556B6, #F36440");
    expect(prefix).toContain("using Söhne typography aesthetic");
    expect(prefix).toContain("with airy spacing");
  });

  it("falls back to team brand_rules colors when the card spec carries none", () => {
    const style = extractBrandStyle({ cardSpecJson: JSON.stringify({ template: "basic" }), brandRulesJson: JSON.stringify({ allowedColors: ["#0C0A0F"] }) });
    expect(style.colors).toEqual(["#0C0A0F"]);
    expect(buildStyleInheritancePrefix({ colors: [], typography: null, spacing: null })).toBe("");
  });

  it("creates N assets and one cost row per image for a valid batch", async () => {
    const result = await runBatchImagegen({ userId: "u1", prompt: "sprout badge", count: 3, model: "gpt-image-1", transparent: true, style: { colors: ["#2556B6"], typography: null, spacing: null } });

    expect(result.generated).toBe(3);
    expect(result.requested).toBe(3);
    expect(result.assetIds.length).toBe(3);
    expect(result.totalCostMicros).toBe(3 * 80_000);

    expect(db._tables.get("assets")?.length).toBe(3);
    const costRows = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.provider === "openai" && r.operation === "openai.imagegen.gpt-image-1");
    expect(costRows.length).toBe(3);

    // Every generated image must be persisted to R2 (no discarded paid bytes), and the stored
    // s3_uri must be the canonical s3://magpie-media/... produced by storage.createS3Uri.
    expect((storage as any)._puts.length).toBe(3);
    expect((storage as any)._puts.every((p: any) => p.bucket === "magpie-media" && p.contentType === "image/png" && p.size > 0)).toBe(true);
    for (const row of db._tables.get("assets")!) {
      expect(String(row.s3Uri).startsWith("s3://magpie-media/assets/agent-gen/")).toBe(true);
    }

    // Style inheritance must be visible in the stored prompt provenance.
    const provenance = JSON.parse(db._tables.get("assets")![0].provenanceJson);
    expect(provenance.prompt).toContain("in the style of palette #2556B6");
    expect(provenance.batch).toBe(true);
    expect(provenance.model).toBe("gpt-image-1");
  });

  it("rejects the entire batch when the daily budget cannot cover it", async () => {
    // cap = 5_000_000 micros; leave only 40k, below 3 * 80k.
    db._seed(costLedger, [{ userId: "u1", costMicros: 4_960_000, occurredAt: Date.now() }]);
    await expect(
      runBatchImagegen({ userId: "u1", prompt: "p", count: 3, model: "gpt-image-2", transparent: false, style: { colors: [], typography: null, spacing: null } }),
    ).rejects.toMatchObject({ status: 429 });
    expect(db._tables.get("assets")?.length ?? 0).toBe(0);
  });

  it("resolves brand style from an owned card and reports missing cards", async () => {
    db._seed(cards, [{ id: "card1", creatorUserId: "u1", status: "draft", cardSpecJson: JSON.stringify({ colors: ["#F36440"], typography: "Inter" }) }]);
    db._seed(brandRuleVersions, [{ id: "rule1", active: 1, rulesJson: JSON.stringify({ allowedColors: ["#000000"] }) }]);

    const owned = await resolveCardStyle(db, "u1", "card1");
    expect(owned.found).toBe(true);
    expect(owned.style.colors).toEqual(["#F36440"]);
    expect(owned.style.typography).toBe("Inter");

    const missing = await resolveCardStyle(db, "u1", "nope");
    expect(missing.found).toBe(false);
  });

  it("POST /imagegen/batch returns 400 when count exceeds the max", async () => {
    const app = new Hono().route("/api/public", imagegenBatchRoutes);
    const res = await app.request("/api/public/imagegen/batch", { method: "POST", body: JSON.stringify({ prompt: "p", count: 9, model: "gpt-image-1" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("count_exceeded");
  });

  it("POST /imagegen/batch returns 404 for an unknown cardId", async () => {
    const app = new Hono().route("/api/public", imagegenBatchRoutes);
    const res = await app.request("/api/public/imagegen/batch", { method: "POST", body: JSON.stringify({ prompt: "p", count: 2, model: "gpt-image-1", cardId: "missing" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("card_not_found");
  });

  it("POST /imagegen/batch creates assets for a valid authenticated request", async () => {
    const app = new Hono().route("/api/public", imagegenBatchRoutes);
    const res = await app.request("/api/public/imagegen/batch", { method: "POST", body: JSON.stringify({ prompt: "coral sprout", count: 2, model: "gpt-image-2", transparent: false }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.assetIds.length).toBe(2);
    expect(json.generated).toBe(2);
    expect(json.totalCostMicros).toBe(2 * 80_000);
  });
});
