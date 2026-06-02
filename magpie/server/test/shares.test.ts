import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { storage } from "edgespark";
import { agentRuns, assets, brandRuleVersions, cardRuleReports, cards, palettes, shares } from "@defs";
import { shareRoutes } from "../src/routes/shares";
import { baselineRules } from "../src/lib/rules/engine";

describe("share routes", () => {
  beforeEach(() => {
    db._reset();
    storage._resetPuts();
    auth.user = { id: "owner", email: "owner@youware.com" };
    storage._seedObject("magpie-media", "assets/agent-gen/bird.png", 12, new Date(0), "image/png");
    db._seed(brandRuleVersions, [{ id: "rule1", rulesJson: JSON.stringify(baselineRules()), active: 1 }]);
    db._seed(agentRuns, [{ id: "run1", userId: "owner", planJson: "{}", prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", createdAt: 1 }]);
    db._seed(palettes, [{
      id: "palette1",
      name: "Internal palette",
      colorsJson: JSON.stringify({ coral: "#F36440", navy: "#2556B6" }),
      source: "manual",
      lockVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    }]);
    db._seed(assets, [{
      id: "asset1",
      kind: "image",
      source: "agent-gen",
      ownerUserId: "owner",
      name: "Bird",
      s3Uri: "s3://magpie-media/assets/agent-gen/bird.png",
      contentType: "image/png",
      byteSize: 12,
      status: "ready",
      transparent: 1,
      tagsJson: "[]",
      provenanceJson: "{}",
      createdAt: 1,
      updatedAt: 1,
      lockVersion: 0,
    }]);
    db._seed(cards, [{
      id: "card1",
      cardRootId: "card1",
      parentCardId: null,
      title: "Shared card",
      status: "draft",
      creatorUserId: "owner",
      ratioPreset: "ig-post",
      width: 1080,
      height: 1080,
      paletteId: "palette1",
      primaryAssetId: "asset1",
      cardSpecJson: JSON.stringify({
        background: "#2556B6",
        internalCardId: "card1",
        layers: [
          { id: "l_asset", kind: "asset", assetId: "asset1", groupId: "group1", name: "Bird", opacity: 1, visible: true, locked: false, x: 12, y: 24, width: 320, height: 240 },
          { id: "l_text", kind: "text", name: "Headline", content: "Shared card", fontSize: 42, textAlign: "center", opacity: 0.9, visible: true },
        ],
      }),
      slotAssignmentsJson: "{}",
      copyBlockJson: "{}",
      agentRunId: "run1",
      templateVersion: "card1",
      ruleVersionAtSave: "rule1",
      lockVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    }]);
    db._seed(cardRuleReports, [{ id: "report1", cardId: "card1", ruleVersionId: "rule1", reportJson: JSON.stringify({ pass: true, findings: [{ code: "ok" }] }), pass: 1, createdAt: 2 }]);
    db._seed(shares, []);
  });

  it("creates a public read-only share link without returning the token hash", async () => {
    const app = new Hono().route("/api/public", shareRoutes);
    const res = await app.request("https://magpie.test/api/public/cards/card1/share", {
      method: "POST",
      body: JSON.stringify({ publicAccess: true }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/magpie\.test\/share\//);
    expect(json.token).toHaveLength(36);
    const row = db._tables.get("shares")?.[0];
    expect(row.cardId).toBe("card1");
    expect(row.tokenHash).not.toBe(json.token);
  });

  it("serves an anonymous public DTO without internal DB identifiers", async () => {
    const app = new Hono().route("/api/public", shareRoutes);
    const create = await app.request("https://magpie.test/api/public/cards/card1/share", {
      method: "POST",
      body: JSON.stringify({ publicAccess: true }),
    });
    const { token } = await create.json();
    auth.user = null;

    const res = await app.request(`https://magpie.test/api/public/shares/${token}`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share).toEqual({ publicAccess: true });
    expect(json.ruleReport).toBeUndefined();
    expect(json.palette).toBeUndefined();
    expect(json.card).toMatchObject({
      title: "Shared card",
      name: "Shared card",
      ratioPreset: "ig-post",
      width: 1080,
      height: 1080,
      background: "#2556B6",
    });
    expect(json.card.cardSpec.layers[0].src).toMatch(/^https:\/\/magpie\.test\/api\/public\/share-assets\/0-[a-f0-9]{32}$/);
    expect(json.card.cardSpec.layers[0]).toMatchObject({ kind: "asset", name: "Bird", x: 12, y: 24, width: 320, height: 240 });
    expect(json.card.cardSpec.layers[1]).toMatchObject({ kind: "text", content: "Shared card", fontSize: 42, textAlign: "center" });
    const assetRes = await app.request(new URL(json.card.cardSpec.layers[0].src).pathname);
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("Content-Type")).toBe("image/png");
    expect(JSON.stringify(json)).not.toContain("s3://");
    for (const key of collectKeys(json)) {
      expect([
        "id",
        "cardId",
        "parentCardId",
        "cardRootId",
        "paletteId",
        "ownerUserId",
        "creatorUserId",
        "lockVersion",
        "createdAt",
        "updatedAt",
        "ruleVersionId",
        "assetId",
        "primaryAssetId",
        "groupId",
        "internalCardId",
      ]).not.toContain(key);
    }
    for (const forbiddenValue of ["share_", "card1", "palette1", "owner", "asset1", "report1", "rule1", "l_asset", "group1"]) {
      expect(JSON.stringify(json)).not.toContain(forbiddenValue);
    }
  });

  it("revokes public access so the token no longer resolves", async () => {
    const app = new Hono().route("/api/public", shareRoutes);
    const create = await app.request("https://magpie.test/api/public/cards/card1/share", {
      method: "POST",
      body: JSON.stringify({ publicAccess: true }),
    });
    const { token } = await create.json();
    const revoke = await app.request("https://magpie.test/api/public/cards/card1/share", {
      method: "POST",
      body: JSON.stringify({ publicAccess: false }),
    });
    expect(revoke.status).toBe(200);
    auth.user = null;

    const res = await app.request(`https://magpie.test/api/public/shares/${token}`);

    expect(res.status).toBe(404);
  });
});

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [key, ...collectKeys(child)]);
}
