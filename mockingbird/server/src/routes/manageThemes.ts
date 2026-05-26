import { Hono } from "hono";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { apiKeys, matchRules, themes } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { generateApiKey } from "../lib/keys";
import { parseRule } from "../lib/rules/parser";
import { explainRule } from "../lib/rules/explain";
import { validateFonts, validatePalette } from "../lib/themeValidation";

const LAYOUTS = new Set(["terminal", "magazine", "gallery", "letter"]);
const STATUSES = new Set(["draft", "active", "paused", "archived"]);

export const themesManageRoutes = new Hono<AppEnv>()
  .get("/keys", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
    return c.json({ keys: rows });
  })
  .post("/keys", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.name !== "string" || !body.name.trim()) return httpError(c, 400, "invalid_request", "name is required.");
    const { db } = await import("edgespark");
    const key = await generateApiKey();
    const now = Date.now();
    const [row] = await db.insert(apiKeys).values({ id: newId(), name: body.name.trim().slice(0, 80), keyHash: key.hash, prefix: key.prefix, createdAt: now, lastUsedAt: null, revokedAt: null }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt });
    return c.json({ key: row, plaintext: key.plaintext }, 201);
  })
  .delete("/keys/:id", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(apiKeys).set({ revokedAt: Date.now() }).where(and(eq(apiKeys.id, c.req.param("id")), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
    if (!row) return httpError(c, 404, "key_not_found", "API key not found.");
    return c.json({ revoked: true });
  })
  .get("/themes", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(themes).where(isNull(themes.deletedAt)).orderBy(desc(themes.priority), asc(themes.slug));
    return c.json({ themes: rows.map(formatTheme) });
  })
  .post("/themes", async (c) => {
    const body = await readJson(c);
    const parsed = parseThemeBody(body, true);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const { db } = await import("edgespark");
    const now = Date.now();
    const value = parsed.value;
    const [row] = await db.insert(themes).values({ id: newId(), slug: value.slug!, name: value.name!, layoutKey: value.layoutKey!, status: value.status ?? "draft", priority: value.priority ?? 0, abWeight: value.abWeight ?? 100, paletteJson: value.paletteJson ?? "{}", fontJson: value.fontJson ?? "{}", layoutConfigJson: value.layoutConfigJson ?? "{}", copyPrompt: value.copyPrompt ?? "", defaultTone: value.defaultTone ?? "clear, warm, concise", fallbackCopyJson: value.fallbackCopyJson ?? "{}", isDefault: value.isDefault ? 1 : 0, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    return c.json({ theme: formatTheme(row) }, 201);
  })
  .get("/themes/:themeId", async (c) => {
    const row = await loadTheme(c.req.param("themeId"));
    if (!row) return httpError(c, 404, "theme_not_found", "Theme not found.");
    return c.json({ theme: formatTheme(row) });
  })
  .patch("/themes/:themeId", async (c) => {
    const current = await loadTheme(c.req.param("themeId"));
    if (!current) return httpError(c, 404, "theme_not_found", "Theme not found.");
    const body = await readJson(c);
    if (!lockMatches(body, current.lockVersion)) return httpError(c, 409, "lock_conflict", "Theme changed; reload before editing.");
    const parsed = parseThemeBody(body, false);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const { db } = await import("edgespark");
    const [row] = await db.update(themes).set({ ...parsed.value, isDefault: parsed.value.isDefault === undefined ? undefined : parsed.value.isDefault ? 1 : 0, lockVersion: current.lockVersion + 1, updatedAt: Date.now() }).where(and(eq(themes.id, current.id), eq(themes.lockVersion, current.lockVersion), isNull(themes.deletedAt))).returning();
    if (!row) return httpError(c, 409, "lock_conflict", "Theme changed; reload before editing.");
    return c.json({ theme: formatTheme(row) });
  })
  .delete("/themes/:themeId", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(themes).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(and(eq(themes.id, c.req.param("themeId")), isNull(themes.deletedAt))).returning({ id: themes.id });
    if (!row) return httpError(c, 404, "theme_not_found", "Theme not found.");
    return c.json({ deleted: true });
  })
  .post("/themes/:themeId/clone", async (c) => {
    const current = await loadTheme(c.req.param("themeId"));
    if (!current) return httpError(c, 404, "theme_not_found", "Theme not found.");
    const { db } = await import("edgespark");
    const now = Date.now();
    const [row] = await db.insert(themes).values({ ...current, id: newId(), slug: `${current.slug}-copy-${now}`, name: `${current.name} Copy`, status: "draft", isDefault: 0, lockVersion: 0, createdAt: now, updatedAt: now }).returning();
    return c.json({ theme: formatTheme(row) }, 201);
  })
  .get("/themes/:themeId/rules", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(matchRules).where(and(eq(matchRules.themeId, c.req.param("themeId")), isNull(matchRules.deletedAt))).orderBy(desc(matchRules.score), asc(matchRules.createdAt));
    return c.json({ rules: rows.map(formatRule) });
  })
  .post("/themes/:themeId/rules", async (c) => {
    if (!(await loadTheme(c.req.param("themeId")))) return httpError(c, 404, "theme_not_found", "Theme not found.");
    const parsed = parseRuleBody(await readJson(c), true);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const { db } = await import("edgespark");
    const now = Date.now();
    const ast = parseRule(parsed.value.expression!);
    const [row] = await db.insert(matchRules).values({ id: newId(), themeId: c.req.param("themeId"), expression: parsed.value.expression!, compiledJson: JSON.stringify(ast), score: parsed.value.score ?? 10, enabled: parsed.value.enabled === false ? 0 : 1, explanation: explainRule(ast), lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    return c.json({ rule: formatRule(row) }, 201);
  })
  .patch("/themes/:themeId/rules/:ruleId", async (c) => {
    const current = await loadRule(c.req.param("themeId"), c.req.param("ruleId"));
    if (!current) return httpError(c, 404, "rule_not_found", "Rule not found.");
    const body = await readJson(c);
    if (!lockMatches(body, current.lockVersion)) return httpError(c, 409, "lock_conflict", "Rule changed; reload before editing.");
    const parsed = parseRuleBody(body, false);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const ast = parsed.value.expression ? parseRule(parsed.value.expression) : null;
    const { db } = await import("edgespark");
    const [row] = await db.update(matchRules).set({ ...parsed.value, compiledJson: ast ? JSON.stringify(ast) : undefined, explanation: ast ? explainRule(ast) : undefined, enabled: parsed.value.enabled === undefined ? undefined : parsed.value.enabled ? 1 : 0, lockVersion: current.lockVersion + 1, updatedAt: Date.now() }).where(and(eq(matchRules.id, current.id), eq(matchRules.lockVersion, current.lockVersion), isNull(matchRules.deletedAt))).returning();
    return c.json({ rule: formatRule(row) });
  })
  .delete("/themes/:themeId/rules/:ruleId", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(matchRules).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(and(eq(matchRules.id, c.req.param("ruleId")), eq(matchRules.themeId, c.req.param("themeId")), isNull(matchRules.deletedAt))).returning({ id: matchRules.id });
    if (!row) return httpError(c, 404, "rule_not_found", "Rule not found.");
    return c.json({ deleted: true });
  });

async function loadTheme(id: string) {
  const { db } = await import("edgespark");
  return (await db.select().from(themes).where(and(eq(themes.id, id), isNull(themes.deletedAt))).limit(1))[0] ?? null;
}
async function loadRule(themeId: string, id: string) {
  const { db } = await import("edgespark");
  return (await db.select().from(matchRules).where(and(eq(matchRules.id, id), eq(matchRules.themeId, themeId), isNull(matchRules.deletedAt))).limit(1))[0] ?? null;
}
function formatTheme(row: typeof themes.$inferSelect) { return { ...row, isDefault: row.isDefault === 1, palette: safeJson(row.paletteJson, {}), font: safeJson(row.fontJson, {}), layoutConfig: safeJson(row.layoutConfigJson, {}), fallbackCopy: safeJson(row.fallbackCopyJson, {}) }; }
function formatRule(row: typeof matchRules.$inferSelect) { return { ...row, enabled: row.enabled === 1, compiled: safeJson(row.compiledJson, null) }; }
type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
function parseThemeBody(body: unknown, creating: boolean): Parsed<Record<string, any>> {
  if (!isRecord(body)) return { ok: false, message: "Request body must be a JSON object." };
  const v: Record<string, any> = {};
  for (const k of ["slug", "name", "layoutKey", "status"] as const) if (body[k] !== undefined) v[k] = String(body[k]).trim();
  if (body.copyPrompt !== undefined) {
    const copyPrompt = String(body.copyPrompt).trim();
    if (byteLength(copyPrompt) > 2048) return { ok: false, message: "copyPrompt must be 2048 bytes or less." };
    v.copyPrompt = copyPrompt;
  }
  if (body.defaultTone !== undefined) {
    const defaultTone = String(body.defaultTone).trim();
    if (byteLength(defaultTone) > 256) return { ok: false, message: "defaultTone must be 256 bytes or less." };
    v.defaultTone = defaultTone;
  }
  if (creating && (!v.slug || !v.name || !v.layoutKey)) return { ok: false, message: "slug, name, and layoutKey are required." };
  if (v.slug && !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(v.slug)) return { ok: false, message: "slug is invalid." };
  if (v.layoutKey && !LAYOUTS.has(v.layoutKey)) return { ok: false, message: "layoutKey is invalid." };
  if (v.status && !STATUSES.has(v.status)) return { ok: false, message: "status is invalid." };
  for (const k of ["priority", "abWeight"] as const) if (body[k] !== undefined) v[k] = Number(body[k]);
  try {
    if (body.palette !== undefined) {
      const palette = validatePalette(body.palette);
      if (!palette.ok) return { ok: false, message: palette.message };
      v.paletteJson = cappedJson(palette.value, "palette", 8192);
    }
    if (body.font !== undefined) {
      const font = validateFonts(body.font);
      if (!font.ok) return { ok: false, message: font.message };
      v.fontJson = cappedJson(font.value, "font", 8192);
    }
    for (const k of ["layoutConfig", "fallbackCopy"] as const) if (body[k] !== undefined) v[`${k}Json`] = cappedJson(body[k], k, 8192);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "JSON field is too large." };
  }
  if (body.isDefault !== undefined) v.isDefault = Boolean(body.isDefault);
  return { ok: true, value: v };
}
function parseRuleBody(body: unknown, creating: boolean): Parsed<{ expression?: string; score?: number; enabled?: boolean }> {
  if (!isRecord(body)) return { ok: false, message: "Request body must be a JSON object." };
  const v: { expression?: string; score?: number; enabled?: boolean } = {};
  if (body.expression !== undefined || creating) {
    if (typeof body.expression !== "string" || !body.expression.trim()) return { ok: false, message: "expression is required." };
    parseRule(body.expression);
    v.expression = body.expression.trim();
  }
  if (body.score !== undefined) v.score = Number(body.score);
  if (body.enabled !== undefined) v.enabled = Boolean(body.enabled);
  return { ok: true, value: v };
}
async function readJson(c: any): Promise<unknown> { try { return await c.req.json(); } catch { return null; } }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function lockMatches(body: unknown, current: number): boolean { return isRecord(body) && body.lockVersion === current; }
function cappedJson(value: unknown, name: string, max: number): string { const json = JSON.stringify(value); if (new TextEncoder().encode(json).byteLength > max) throw new Error(`${name} is too large.`); return json; }
function safeJson(raw: string, fallback: unknown): unknown { try { return JSON.parse(raw); } catch { return fallback; } }
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
