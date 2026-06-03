import { Hono } from "hono";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { agentRuns, assets, cardRuleReports, cards, teamProfiles, templateMarketplace } from "@defs";
import { safePresignPreview } from "../lib/description/autotag";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { parseJson } from "../lib/json";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";

type Principal = AppEnv["Variables"]["principal"];

export const templateMarketplaceRoutes = new Hono<AppEnv>()
  .get("/templates/marketplace", async (c) => {
    const { limit, offset } = pagination(c.req.query("limit"), c.req.query("offset"), c.req.query("page"));
    const published = (await db.select().from(templateMarketplace))
      .filter((row: any) => !row.unpublishedAt)
      .sort((a: any, b: any) => Number(b.publishedAt ?? 0) - Number(a.publishedAt ?? 0));
    const pageRows = published.slice(offset, offset + limit + 1);
    const templates = [];
    for (const row of pageRows.slice(0, limit)) {
      const item = await publicTemplateItem(row);
      if (item) templates.push(item);
    }
    const nextOffset = offset + limit;
    return c.json({
      templates,
      pagination: {
        limit,
        offset,
        hasMore: pageRows.length > limit,
        nextOffset: pageRows.length > limit ? nextOffset : null,
      },
    });
  })
  .use("/templates/:id/use", approvedUserOrAgentKey)
  .post("/templates/:id/use", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const entry = await resolveActiveTemplate(c.req.param("id"));
    if (!entry) return httpError(c, 404, "not_found", "Template not found.");
    const [source] = await db.select().from(cards).where(eq(cards.id, entry.cardId)).limit(1);
    if (!source || source.deletedAt || source.status !== "ready") return httpError(c, 404, "not_found", "Template not found.");
    const now = Date.now();
    const runId = newId("run");
    const cardId = newId("card");
    await db.insert(agentRuns).values({
      id: runId,
      userId,
      sessionId: null,
      cardId,
      plannedParentCardId: source.id,
      provider: "system",
      model: "template-marketplace",
      state: "completed",
      prompt: "Use marketplace template.",
      planJson: JSON.stringify({ ruleVersionAtSave: source.ruleVersionAtSave, parentCardId: source.id, marketplaceTemplateId: entry.id }),
      toolsJson: JSON.stringify(["templates.use"]),
      outputRefsJson: JSON.stringify([{ type: "card", cardId, title: `${source.title} copy` }]),
      costMicros: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
    });
    await db.insert(cards).values({
      id: cardId,
      cardRootId: source.cardRootId ?? source.id,
      parentCardId: source.id,
      title: `${source.title} copy`,
      status: "draft",
      creatorUserId: userId,
      ratioPreset: source.ratioPreset,
      width: source.width,
      height: source.height,
      paletteId: source.paletteId ?? null,
      primaryAssetId: source.primaryAssetId ?? null,
      cardSpecJson: source.cardSpecJson,
      slotAssignmentsJson: source.slotAssignmentsJson,
      copyBlockJson: source.copyBlockJson,
      renderManifestJson: source.renderManifestJson,
      agentRunId: runId,
      templateVersion: source.id,
      ruleVersionAtSave: source.ruleVersionAtSave,
      ownerOverrideJson: null,
      lockVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    await copyLatestRuleReport(source.id, cardId, now);
    await db.update(templateMarketplace).set({ useCount: Number(entry.useCount ?? 0) + 1, updatedAt: now, lockVersion: Number(entry.lockVersion ?? 0) + 1 }).where(eq(templateMarketplace.id, entry.id));
    return c.json({ cardId }, 201);
  })
  .use("/cards/:id/publish-template", approvedUserOrAgentKey)
  .post("/cards/:id/publish-template", async (c) => {
    const principal = c.get("principal");
    const [card] = await db.select().from(cards).where(eq(cards.id, c.req.param("id"))).limit(1);
    if (!card || card.deletedAt) return httpError(c, 404, "not_found", "Card not found.");
    if (!canMutateCardTemplate(principal, card)) return httpError(c, 403, "forbidden", "Only the card creator or owner can publish this template.");
    if (card.status !== "ready") return httpError(c, 409, "card_not_ready", "Only ready cards can be published as marketplace templates.");
    const now = Date.now();
    const existing = (await db.select().from(templateMarketplace)).find((row: any) => row.cardId === card.id);
    const authorDisplayName = await authorName(card.creatorUserId);
    if (existing) {
      await db.update(templateMarketplace).set({
        title: card.title,
        authorDisplayName,
        thumbnailAssetId: card.primaryAssetId ?? null,
        unpublishedAt: null,
        updatedAt: now,
        lockVersion: Number(existing.lockVersion ?? 0) + 1,
      }).where(eq(templateMarketplace.id, existing.id));
      const [updated] = await db.select().from(templateMarketplace).where(eq(templateMarketplace.id, existing.id)).limit(1);
      return c.json({ template: await publicTemplateItem(updated) });
    }
    const row = {
      id: newId("tpl"),
      cardId: card.id,
      title: card.title,
      publishedByUserId: card.creatorUserId,
      authorDisplayName,
      thumbnailAssetId: card.primaryAssetId ?? null,
      useCount: 0,
      publishedAt: now,
      updatedAt: now,
      unpublishedAt: null,
      lockVersion: 0,
    };
    await db.insert(templateMarketplace).values(row);
    return c.json({ template: await publicTemplateItem(row) }, 201);
  })
  .delete("/cards/:id/publish-template", async (c) => {
    const principal = c.get("principal");
    const [card] = await db.select().from(cards).where(eq(cards.id, c.req.param("id"))).limit(1);
    if (!card || card.deletedAt) return httpError(c, 404, "not_found", "Card not found.");
    if (!canMutateCardTemplate(principal, card)) return httpError(c, 403, "forbidden", "Only the card creator or owner can unpublish this template.");
    const existing = (await db.select().from(templateMarketplace)).find((row: any) => row.cardId === card.id);
    if (!existing) return c.json({ unpublished: true, templateId: null });
    const now = Date.now();
    await db.update(templateMarketplace).set({ unpublishedAt: existing.unpublishedAt ?? now, updatedAt: now, lockVersion: Number(existing.lockVersion ?? 0) + 1 }).where(eq(templateMarketplace.id, existing.id));
    return c.json({ unpublished: true, templateId: existing.id });
  });

async function publicTemplateItem(row: any): Promise<Record<string, unknown> | null> {
  if (!row || row.unpublishedAt) return null;
  const [card] = await db.select().from(cards).where(eq(cards.id, row.cardId)).limit(1);
  if (!card || card.deletedAt || card.status !== "ready") return null;
  const previewAssetId = row.thumbnailAssetId ?? card.primaryAssetId ?? null;
  const previewUrl = previewAssetId ? await previewForAsset(previewAssetId) : null;
  return {
    id: row.id,
    title: String(row.title || card.title || "Untitled template"),
    previewUrl,
    thumbnailUrl: previewUrl,
    author: { displayName: sanitizeAuthorName(row.authorDisplayName) },
    authorDisplayName: sanitizeAuthorName(row.authorDisplayName),
    publishedAt: row.publishedAt,
    useCount: Number(row.useCount ?? 0),
  };
}

async function previewForAsset(assetId: string): Promise<string | null> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset || asset.deletedAt || typeof asset.s3Uri !== "string") return null;
  return safePresignPreview(asset.s3Uri);
}

async function resolveActiveTemplate(id: string): Promise<any | null> {
  const [byId] = await db.select().from(templateMarketplace).where(eq(templateMarketplace.id, id)).limit(1);
  if (byId && !byId.unpublishedAt) return byId;
  const rows = await db.select().from(templateMarketplace);
  return rows.find((row: any) => row.cardId === id && !row.unpublishedAt) ?? null;
}

async function copyLatestRuleReport(sourceCardId: string, targetCardId: string, now: number): Promise<void> {
  const reports = (await db.select().from(cardRuleReports).where(eq(cardRuleReports.cardId, sourceCardId)))
    .slice()
    .sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  const latest = reports[0];
  if (!latest) return;
  await db.insert(cardRuleReports).values({
    id: newId("crr"),
    cardId: targetCardId,
    ruleVersionId: latest.ruleVersionId,
    reportJson: latest.reportJson,
    pass: latest.pass,
    score: latest.score,
    ownerOverrideJson: latest.ownerOverrideJson ?? null,
    createdAt: now,
  });
}

async function authorName(userId: string): Promise<string> {
  const [profile] = await db.select().from(teamProfiles).where(eq(teamProfiles.userId, userId)).limit(1);
  return sanitizeAuthorName(profile?.displayName);
}

function sanitizeAuthorName(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.includes("@")) return "Magpie creator";
  return raw.slice(0, 80);
}

function canMutateCardTemplate(principal: Principal, card: any): boolean {
  if (principal.kind === "owner") return true;
  if (principal.kind === "user" && principal.role === "owner") return true;
  return principalUserId(principal) === card.creatorUserId;
}

function principalUserId(principal: Principal): string | null {
  return principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
}

function pagination(limitRaw?: string, offsetRaw?: string, pageRaw?: string): { limit: number; offset: number } {
  const limit = clampInt(limitRaw, 20, 1, 50);
  const offset = offsetRaw === undefined && pageRaw !== undefined
    ? Math.max(0, (clampInt(pageRaw, 1, 1, 10_000) - 1) * limit)
    : clampInt(offsetRaw, 0, 0, 100_000);
  return { limit, offset };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
