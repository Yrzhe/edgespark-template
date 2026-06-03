import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { agentRuns, assets, cardRuleReports, cards, teamProfiles, templateMarketplace } from "@defs";
import { templateMarketplaceRoutes } from "../src/routes/templates";

describe("template marketplace", () => {
  beforeEach(() => {
    db._reset();
    auth.user = { id: "owner", email: "owner@youware.com" };
    db._seed(teamProfiles, [
      { userId: "owner", email: "owner@youware.com", displayName: "Adrian Bloome", approvalStatus: "approved", role: "owner", createdAt: 1, updatedAt: 1 },
      { userId: "member", email: "member@youware.com", displayName: "Forge User", approvalStatus: "approved", role: "member", createdAt: 1, updatedAt: 1 },
      { userId: "other", email: "other@youware.com", displayName: "Other User", approvalStatus: "approved", role: "member", createdAt: 1, updatedAt: 1 },
    ]);
    db._seed(assets, [
      { id: "asset1", s3Uri: "s3://magpie-media/previews/card1.png", contentType: "image/png", byteSize: 12, deletedAt: null },
    ]);
    seedCard("card1", { primaryAssetId: "asset1" });
    db._seed(cardRuleReports, [
      { id: "report1", cardId: "card1", ruleVersionId: "rule1", reportJson: JSON.stringify({ pass: true, findings: [] }), pass: 1, score: 100, createdAt: 2 },
    ]);
  });

  it("publishes the caller's own ready card idempotently and rejects foreign publish", async () => {
    const app = new Hono().route("/api/public", templateMarketplaceRoutes);

    const first = await app.request("/api/public/cards/card1/publish-template", { method: "POST" });
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.template).toMatchObject({
      title: "Ready template",
      authorDisplayName: "Adrian Bloome",
      useCount: 0,
    });
    expect(db._tables.get("template_marketplace")).toHaveLength(1);

    const second = await app.request("/api/public/cards/card1/publish-template", { method: "POST" });
    expect(second.status).toBe(200);
    expect(db._tables.get("template_marketplace")).toHaveLength(1);

    auth.user = { id: "member", email: "member@youware.com" };
    const foreign = await app.request("/api/public/cards/card1/publish-template", { method: "POST" });
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error.code).toBe("forbidden");
  });

  it("unpublishes idempotently and rejects foreign unpublish", async () => {
    const app = new Hono().route("/api/public", templateMarketplaceRoutes);
    await app.request("/api/public/cards/card1/publish-template", { method: "POST" });
    const row = db._tables.get("template_marketplace")![0];

    auth.user = { id: "member", email: "member@youware.com" };
    const foreign = await app.request("/api/public/cards/card1/publish-template", { method: "DELETE" });
    expect(foreign.status).toBe(403);

    auth.user = { id: "owner", email: "owner@youware.com" };
    const first = await app.request("/api/public/cards/card1/publish-template", { method: "DELETE" });
    expect(first.status).toBe(200);
    expect(db._tables.get("template_marketplace")![0].unpublishedAt).toBeTruthy();
    const unpublishedAt = db._tables.get("template_marketplace")![0].unpublishedAt;
    const second = await app.request("/api/public/cards/card1/publish-template", { method: "DELETE" });
    expect(second.status).toBe(200);
    expect(db._tables.get("template_marketplace")![0]).toMatchObject({ id: row.id, unpublishedAt });
  });

  it("lists public marketplace templates without private fields or raw storage URIs", async () => {
    db._seed(templateMarketplace, [
      { id: "tpl1", cardId: "card1", title: "Ready template", publishedByUserId: "owner", authorDisplayName: "owner@youware.com", thumbnailAssetId: "asset1", useCount: 3, publishedAt: 10, updatedAt: 10, unpublishedAt: null, lockVersion: 0 },
    ]);
    auth.user = undefined;
    const app = new Hono().route("/api/public", templateMarketplaceRoutes);

    const res = await app.request("/api/public/templates/marketplace?limit=10");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templates).toHaveLength(1);
    expect(json.templates[0]).toEqual({
      id: "tpl1",
      title: "Ready template",
      previewUrl: "https://signed.test/previews%2Fcard1.png",
      thumbnailUrl: "https://signed.test/previews%2Fcard1.png",
      author: { displayName: "Magpie creator" },
      authorDisplayName: "Magpie creator",
      publishedAt: 10,
      useCount: 3,
    });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("owner@youware.com");
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("creatorUserId");
    expect(serialized).not.toContain("publishedByUserId");
    expect(serialized).not.toContain("s3://");
  });

  it("uses a marketplace template as another caller, increments count, and leaves the original untouched", async () => {
    db._seed(templateMarketplace, [
      { id: "tpl1", cardId: "card1", title: "Ready template", publishedByUserId: "owner", authorDisplayName: "Adrian Bloome", thumbnailAssetId: "asset1", useCount: 0, publishedAt: 10, updatedAt: 10, unpublishedAt: null, lockVersion: 0 },
    ]);
    const originalBefore = { ...db._tables.get("cards")![0] };
    auth.user = { id: "member", email: "member@youware.com" };
    const app = new Hono().route("/api/public", templateMarketplaceRoutes);

    const res = await app.request("/api/public/templates/tpl1/use", { method: "POST" });

    expect(res.status).toBe(201);
    const json = await res.json();
    const cloned = db._tables.get("cards")!.find((row) => row.id === json.cardId);
    expect(cloned).toMatchObject({
      creatorUserId: "member",
      parentCardId: "card1",
      cardRootId: "card1",
      status: "draft",
      templateVersion: "card1",
      ruleVersionAtSave: "rule1",
      cardSpecJson: originalBefore.cardSpecJson,
      slotAssignmentsJson: originalBefore.slotAssignmentsJson,
      copyBlockJson: originalBefore.copyBlockJson,
    });
    const source = db._tables.get("cards")!.find((row) => row.id === "card1");
    expect(source).toMatchObject(originalBefore);
    expect(db._tables.get("template_marketplace")![0].useCount).toBe(1);
    const run = db._tables.get("agent_runs")!.find((row) => row.id === cloned.agentRunId);
    expect(run).toMatchObject({ userId: "member", plannedParentCardId: "card1", provider: "system", model: "template-marketplace", state: "completed" });
    const copiedReport = db._tables.get("card_rule_reports")!.find((row) => row.cardId === cloned.id);
    expect(copiedReport).toMatchObject({ ruleVersionId: "rule1", pass: 1, score: 100 });
  });
});

function seedCard(id: string, overrides: Record<string, unknown> = {}) {
  db._seed(cards, [
    {
      id,
      cardRootId: id,
      parentCardId: null,
      title: "Ready template",
      status: "ready",
      creatorUserId: "owner",
      ratioPreset: "ig-post",
      width: 1080,
      height: 1080,
      paletteId: null,
      primaryAssetId: null,
      cardSpecJson: JSON.stringify({ layers: [{ id: "headline", kind: "text", textValue: "Launch" }] }),
      slotAssignmentsJson: JSON.stringify({ main: "asset1" }),
      copyBlockJson: JSON.stringify({ headline: "Launch faster" }),
      renderManifestJson: JSON.stringify({ checksum: "abc" }),
      agentRunId: "run1",
      templateVersion: id,
      ruleVersionAtSave: "rule1",
      lockVersion: 0,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    },
  ]);
  db._seed(agentRuns, [
    { id: "run1", userId: "owner", planJson: JSON.stringify({ ruleVersionAtSave: "rule1" }), prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", outputRefsJson: "[]", createdAt: 1 },
  ]);
}
