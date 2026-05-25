import { Hono, type Context } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { apiKeys, comments, competition, contestants } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { generateApiKey } from "../lib/keys";
import { newId } from "../lib/ids";
import { missingAgentsForSync } from "../lib/contestants";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";
import { fetchUpstream, validateUpstreamBaseUrl } from "../lib/upstream";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const manageRoutes = new Hono<AppEnv>()
  .get("/competition", async (c) => c.json({ competition: await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url)) }))
  .patch("/competition", async (c) => {
    const body = await readJson(c.req.raw);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON body required.");
    await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    const patch = competitionPatch(body);
    if (typeof body.upstreamBaseUrl === "string") {
      const upstream = validateUpstreamBaseUrl(body.upstreamBaseUrl);
      if (!upstream.ok) return httpError(c, 400, "invalid_upstream_base_url", `upstreamBaseUrl rejected: ${upstream.reason}`);
      patch.upstreamBaseUrl = upstream.url;
    }
    if (Object.keys(patch).length === 0) return httpError(c, 400, "invalid_request", "At least one field is required.");
    const { db } = await import("edgespark");
    const [row] = await db.update(competition).set({ ...patch, updatedAt: Date.now() }).where(eq(competition.id, "current")).returning();
    return c.json({ competition: row });
  })
  .post("/competition/start", async (c) => updateStatus(c, "live"))
  .post("/competition/end", async (c) => updateStatus(c, "ended"))
  .get("/contestants", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(contestants).orderBy(asc(contestants.sortOrder), asc(contestants.id));
    return c.json({ contestants: rows });
  })
  .post("/contestants/sync", async (c) => {
    const { db } = await import("edgespark");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    const payload = await fetchUpstream<{ agents: Array<{ id: string; name: string; company?: string; color?: string }> }>("agents", comp.upstreamBaseUrl);
    const existing = new Set((await db.select({ id: contestants.id }).from(contestants)).map((row) => row.id));
    const now = Date.now();
    let inserted = 0;
    for (const [index, agent] of missingAgentsForSync(payload?.agents ?? [], existing).entries()) {
      await db.insert(contestants).values({
        id: agent.id,
        displayName: agent.name,
        tagline: agent.company ?? "",
        avatarS3Uri: null,
        accentColor: agent.color ?? "#2556B6",
        sortOrder: index,
        hidden: 0,
        updatedAt: now,
      });
      inserted++;
    }
    const rows = await db.select().from(contestants).orderBy(asc(contestants.sortOrder), asc(contestants.id));
    return c.json({ ok: true, inserted, contestants: rows });
  })
  .patch("/contestants/:id", async (c) => {
    const body = await readJson(c.req.raw);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON body required.");
    const patch = contestantPatch(body);
    if (Object.keys(patch).length === 0) return httpError(c, 400, "invalid_request", "At least one field is required.");
    const { db } = await import("edgespark");
    const [row] = await db.update(contestants).set({ ...patch, updatedAt: Date.now() }).where(eq(contestants.id, c.req.param("id"))).returning();
    if (!row) return httpError(c, 404, "contestant_not_found", "Contestant not found.");
    return c.json({ contestant: row });
  })
  .post("/contestants/reorder", async (c) => {
    const body = await readJson(c.req.raw);
    if (!isRecord(body) || !Array.isArray(body.items)) return httpError(c, 400, "invalid_request", "items is required.");
    const items = body.items.filter(isRecord).map((item) => ({ id: String(item.id), sortOrder: Number(item.sortOrder) }));
    if (!items.every((item) => item.id && Number.isSafeInteger(item.sortOrder))) return httpError(c, 400, "invalid_request", "Each item needs id and integer sortOrder.");
    const { db } = await import("edgespark");
    const now = Date.now();
    await db.batch(items.map((item) => db.update(contestants).set({ sortOrder: item.sortOrder, updatedAt: now }).where(eq(contestants.id, item.id))) as never);
    return c.json({ ok: true });
  })
  .post("/contestants/:id/avatar/presign", async (c) => {
    const body = await readJson(c.req.raw);
    if (!isRecord(body) || typeof body.contentType !== "string" || !IMAGE_TYPES.has(body.contentType)) {
      return httpError(c, 400, "invalid_request", "contentType must be a supported image type.");
    }
    const { storage } = await import("edgespark");
    const { buckets } = await import("@defs");
    const ext = body.contentType.split("/")[1].replace("jpeg", "jpg");
    const key = `contestants/${c.req.param("id")}/${newId()}/avatar.${ext}`;
    const presigned = await storage.from(buckets.arenaMedia).createPresignedPutUrl(key, 900, { contentType: body.contentType });
    return c.json({ url: presigned.uploadUrl, key, requiredHeaders: presigned.requiredHeaders }, 201);
  })
  .post("/contestants/:id/avatar/confirm", async (c) => {
    const body = await readJson(c.req.raw);
    const id = c.req.param("id");
    if (!isRecord(body) || typeof body.key !== "string" || !body.key.startsWith(`contestants/${id}/`)) return httpError(c, 400, "invalid_request", "key is invalid.");
    const { db, storage } = await import("edgespark");
    const { buckets } = await import("@defs");
    const meta = await storage.from(buckets.arenaMedia).head(body.key);
    if (!meta) return httpError(c, 404, "upload_not_found", "Upload not found.");
    const s3Uri = storage.createS3Uri(buckets.arenaMedia, body.key);
    const [row] = await db.update(contestants).set({ avatarS3Uri: s3Uri, updatedAt: Date.now() }).where(eq(contestants.id, id)).returning();
    if (!row) return httpError(c, 404, "contestant_not_found", "Contestant not found.");
    return c.json({ avatarS3Uri: s3Uri });
  })
  .post("/votes/reset", async (c) => {
    const { db } = await import("edgespark");
    const seasonId = newId();
    await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    await db.update(competition).set({ activeSeasonId: seasonId, updatedAt: Date.now() }).where(eq(competition.id, "current"));
    return c.json({ ok: true, seasonId });
  })
  .get("/comments", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(comments).orderBy(desc(comments.createdAt)).limit(200);
    return c.json({ comments: rows });
  })
  .patch("/comments/:id/hide", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(comments).set({ hidden: 1 }).where(eq(comments.id, Number(c.req.param("id")))).returning({ id: comments.id });
    if (!row) return httpError(c, 404, "comment_not_found", "Comment not found.");
    return c.json({ ok: true });
  })
  .get("/keys", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
    return c.json({ keys: rows });
  })
  .post("/keys", async (c) => {
    const body = await readJson(c.req.raw);
    if (!isRecord(body) || typeof body.name !== "string" || !body.name.trim()) return httpError(c, 400, "invalid_request", "name is required.");
    const { db } = await import("edgespark");
    const key = await generateApiKey();
    const [row] = await db.insert(apiKeys).values({ id: newId(), name: body.name.trim().slice(0, 80), keyHash: key.hash, prefix: key.prefix, createdAt: Date.now(), lastUsedAt: null, revokedAt: null }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt });
    return c.json({ key: row, plaintext: key.plaintext }, 201);
  })
  .delete("/keys/:id", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(apiKeys).set({ revokedAt: Date.now() }).where(and(eq(apiKeys.id, c.req.param("id")), sql`${apiKeys.revokedAt} is null`)).returning({ id: apiKeys.id });
    if (!row) return httpError(c, 404, "key_not_found", "API key not found.");
    return c.json({ revoked: true });
  });

async function updateStatus(c: Context<AppEnv>, status: "live" | "ended") {
  const { db } = await import("edgespark");
  await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  const [row] = await db.update(competition).set({ status, updatedAt: Date.now() }).where(eq(competition.id, "current")).returning();
  return c.json({ competition: row });
}

function competitionPatch(body: Record<string, unknown>) {
  const patch: Partial<typeof competition.$inferInsert> = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if (body.startsAt === null || Number.isSafeInteger(body.startsAt)) patch.startsAt = body.startsAt as number | null;
  if (body.endsAt === null || Number.isSafeInteger(body.endsAt)) patch.endsAt = body.endsAt as number | null;
  if (typeof body.upstreamBaseUrl === "string") patch.upstreamBaseUrl = body.upstreamBaseUrl.trim().replace(/\/+$/, "");
  if (typeof body.votingEnabled === "boolean") patch.votingEnabled = body.votingEnabled ? 1 : 0;
  if (typeof body.commentsEnabled === "boolean") patch.commentsEnabled = body.commentsEnabled ? 1 : 0;
  return patch;
}

function contestantPatch(body: Record<string, unknown>) {
  const patch: Partial<typeof contestants.$inferInsert> = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName.trim().slice(0, 80);
  if (typeof body.tagline === "string") patch.tagline = body.tagline.trim().slice(0, 160);
  if (typeof body.accentColor === "string") patch.accentColor = body.accentColor.trim().slice(0, 20);
  if (Number.isSafeInteger(body.sortOrder)) patch.sortOrder = body.sortOrder as number;
  if (typeof body.hidden === "boolean") patch.hidden = body.hidden ? 1 : 0;
  return patch;
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
