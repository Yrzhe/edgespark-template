import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import { bioBlurbs, projects, socials } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";

type TableName = "bio-blurbs" | "projects" | "socials";
const PROJECT_STATUSES = new Set(["active", "draft", "paused", "archived"]);

export const contentManageRoutes = new Hono<AppEnv>()
  .get("/content/:kind", async (c) => listRows(c, c.req.param("kind") as TableName))
  .post("/content/:kind", async (c) => createRow(c, c.req.param("kind") as TableName))
  .patch("/content/:kind/:id", async (c) => patchRow(c, c.req.param("kind") as TableName, c.req.param("id")))
  .delete("/content/:kind/:id", async (c) => deleteRow(c, c.req.param("kind") as TableName, c.req.param("id")));

async function listRows(c: any, kind: TableName) {
  const { db } = await import("edgespark");
  if (kind === "bio-blurbs") return c.json({ bioBlurbs: await db.select().from(bioBlurbs).where(isNull(bioBlurbs.deletedAt)).orderBy(asc(bioBlurbs.position), asc(bioBlurbs.createdAt)) });
  if (kind === "projects") return c.json({ projects: await db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.position), asc(projects.createdAt)) });
  if (kind === "socials") return c.json({ socials: await db.select().from(socials).where(isNull(socials.deletedAt)).orderBy(asc(socials.position), asc(socials.createdAt)) });
  return httpError(c, 404, "content_kind_not_found", "Content kind not found.");
}

async function createRow(c: any, kind: TableName) {
  const body = await readJson(c);
  const { db } = await import("edgespark");
  const now = Date.now();
  if (kind === "bio-blurbs") {
    const p = parseBio(body, true); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.insert(bioBlurbs).values({ id: newId(), title: p.value.title!, body: p.value.body!, tagsJson: p.value.tagsJson ?? "[]", source: p.value.source ?? "owner", isActive: p.value.isActive === false ? 0 : 1, position: p.value.position ?? 0, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    return c.json({ bioBlurb: row }, 201);
  }
  if (kind === "projects") {
    const p = parseProject(body, true); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.insert(projects).values({ id: newId(), title: p.value.title!, subtitle: p.value.subtitle ?? null, description: p.value.description!, url: p.value.url ?? null, imageId: p.value.imageId ?? null, tagsJson: p.value.tagsJson ?? "[]", status: p.value.status ?? "active", position: p.value.position ?? 0, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    return c.json({ project: row }, 201);
  }
  if (kind === "socials") {
    const p = parseSocial(body, true); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.insert(socials).values({ id: newId(), platform: p.value.platform!, label: p.value.label!, url: p.value.url!, handle: p.value.handle ?? null, iconKey: p.value.iconKey ?? null, isActive: p.value.isActive === false ? 0 : 1, position: p.value.position ?? 0, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    return c.json({ social: row }, 201);
  }
  return httpError(c, 404, "content_kind_not_found", "Content kind not found.");
}

async function patchRow(c: any, kind: TableName, id: string) {
  const body = await readJson(c);
  const { db } = await import("edgespark");
  if (kind === "bio-blurbs") {
    const [cur] = await db.select().from(bioBlurbs).where(and(eq(bioBlurbs.id, id), isNull(bioBlurbs.deletedAt))).limit(1);
    if (!cur) return httpError(c, 404, "content_not_found", "Content row not found.");
    if (!lockMatches(body, cur.lockVersion)) return httpError(c, 409, "lock_conflict", "Row changed; reload before editing.");
    const p = parseBio(body, false); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.update(bioBlurbs).set({ ...p.value, isActive: p.value.isActive === undefined ? undefined : p.value.isActive ? 1 : 0, lockVersion: cur.lockVersion + 1, updatedAt: Date.now() }).where(and(eq(bioBlurbs.id, id), eq(bioBlurbs.lockVersion, cur.lockVersion))).returning();
    return c.json({ bioBlurb: row });
  }
  if (kind === "projects") {
    const [cur] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
    if (!cur) return httpError(c, 404, "content_not_found", "Content row not found.");
    if (!lockMatches(body, cur.lockVersion)) return httpError(c, 409, "lock_conflict", "Row changed; reload before editing.");
    const p = parseProject(body, false); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.update(projects).set({ ...p.value, lockVersion: cur.lockVersion + 1, updatedAt: Date.now() }).where(and(eq(projects.id, id), eq(projects.lockVersion, cur.lockVersion))).returning();
    return c.json({ project: row });
  }
  if (kind === "socials") {
    const [cur] = await db.select().from(socials).where(and(eq(socials.id, id), isNull(socials.deletedAt))).limit(1);
    if (!cur) return httpError(c, 404, "content_not_found", "Content row not found.");
    if (!lockMatches(body, cur.lockVersion)) return httpError(c, 409, "lock_conflict", "Row changed; reload before editing.");
    const p = parseSocial(body, false); if (!p.ok) return httpError(c, 400, "invalid_request", p.message);
    const [row] = await db.update(socials).set({ ...p.value, isActive: p.value.isActive === undefined ? undefined : p.value.isActive ? 1 : 0, lockVersion: cur.lockVersion + 1, updatedAt: Date.now() }).where(and(eq(socials.id, id), eq(socials.lockVersion, cur.lockVersion))).returning();
    return c.json({ social: row });
  }
  return httpError(c, 404, "content_kind_not_found", "Content kind not found.");
}

async function deleteRow(c: any, kind: TableName, id: string) {
  const { db } = await import("edgespark");
  const now = Date.now();
  if (kind === "bio-blurbs") await db.update(bioBlurbs).set({ deletedAt: now, updatedAt: now }).where(eq(bioBlurbs.id, id));
  else if (kind === "projects") await db.update(projects).set({ deletedAt: now, updatedAt: now }).where(eq(projects.id, id));
  else if (kind === "socials") await db.update(socials).set({ deletedAt: now, updatedAt: now }).where(eq(socials.id, id));
  else return httpError(c, 404, "content_kind_not_found", "Content kind not found.");
  return c.json({ deleted: true });
}

function parseBio(body: unknown, creating: boolean) { const b = common(body, creating, ["title", "body"]); if (!b.ok) return b; return { ok: true as const, value: b.value }; }
function parseProject(body: unknown, creating: boolean) {
  const b = common(body, creating, ["title", "description"]);
  if (!b.ok) return b;
  if (b.value.url && !isHttpUrl(b.value.url)) return { ok: false as const, message: "url must be absolute http(s)." };
  if (b.value.status && !PROJECT_STATUSES.has(b.value.status)) return { ok: false as const, message: "status must be active, draft, paused, or archived." };
  return { ok: true as const, value: b.value };
}
function parseSocial(body: unknown, creating: boolean) { const b = common(body, creating, ["platform", "label", "url"]); if (!b.ok) return b; if (b.value.url && !isHttpUrl(b.value.url)) return { ok: false as const, message: "url must be absolute http(s)." }; return { ok: true as const, value: b.value }; }
function common(body: unknown, creating: boolean, required: string[]) {
  if (!isRecord(body)) return { ok: false as const, message: "Request body must be a JSON object." };
  const v: Record<string, any> = {};
  for (const key of ["title", "body", "source", "subtitle", "description", "url", "imageId", "status", "platform", "label", "handle", "iconKey"] as const) if (body[key] !== undefined) v[key] = String(body[key]).trim().slice(0, key === "body" || key === "description" ? 2048 : 240);
  for (const key of required) if (creating && !v[key]) return { ok: false as const, message: `${key} is required.` };
  if (body.tags !== undefined) v.tagsJson = cappedJson(body.tags);
  if (body.position !== undefined) v.position = Number(body.position);
  if (body.isActive !== undefined) v.isActive = Boolean(body.isActive);
  return { ok: true as const, value: v };
}
async function readJson(c: any): Promise<unknown> { try { return await c.req.json(); } catch { return null; } }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function lockMatches(body: unknown, current: number): boolean { return isRecord(body) && body.lockVersion === current; }
function cappedJson(value: unknown): string { const json = JSON.stringify(value); if (new TextEncoder().encode(json).byteLength > 8192) throw new Error("JSON is too large."); return json; }
function isHttpUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }
