import { Hono } from "hono";
import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { apiKeys, brandRuleVersions, events, teamProfiles } from "@defs";
import { generateApiKey } from "../lib/keys";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord } from "../lib/json";
import { nextProfileState } from "../lib/profiles";
import { baselineRules } from "../lib/rules/engine";
import { addSignupWhitelistEntry, deactivateSignupWhitelistEntry, listSignupWhitelist, parseWhitelistKind } from "../lib/signupWhitelist";
import { ownerSessionOrOwnerToken, type AppEnv } from "../middleware/managementAuth";

export const manageRoutes = new Hono<AppEnv>()
  .use("*", ownerSessionOrOwnerToken)
  .get("/profiles", async (c) => c.json({ profiles: await db.select().from(teamProfiles) }))
  .patch("/profiles/:userId", async (c) => updateProfile(c, false))
  .post("/profiles/:userId/restore-approved", async (c) => updateProfile(c, true))
  .get("/whitelist", async (c) => c.json({ whitelist: await listSignupWhitelist() }))
  .post("/whitelist", async (c) => {
    const body = await readBody(c);
    const kind = parseWhitelistKind(body?.kind);
    if (!body || !kind || typeof body.value !== "string") return httpError(c, 400, "invalid_request", "kind and value are required.");
    try {
      const row = await addSignupWhitelistEntry(kind, body.value, principalLabel(c.get("principal")));
      return c.json(row, 201);
    } catch (error) {
      return httpError(c, 400, error instanceof Error ? error.message : "invalid_whitelist_entry", "Invalid whitelist entry.");
    }
  })
  .delete("/whitelist/:id", async (c) => {
    const ok = await deactivateSignupWhitelistEntry(c.req.param("id"));
    if (!ok) return httpError(c, 404, "not_found", "Whitelist entry not found.");
    return c.json({ ok: true });
  })
  .get("/events", async (c) => {
    const level = c.req.query("level");
    const code = c.req.query("code");
    const since = parseTimeQuery(c.req.query("since"));
    const until = parseTimeQuery(c.req.query("until"));
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 200) || 200, 1), 500);
    const rows = (await db.select().from(events))
      .filter((event: any) => !level || event.level === level)
      .filter((event: any) => !code || event.code === code)
      .filter((event: any) => since === null || Number(event.createdAt) >= since)
      .filter((event: any) => until === null || Number(event.createdAt) <= until)
      .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, limit);
    return c.json({ events: rows, limit });
  })
  .get("/events/:id", async (c) => {
    const [event] = await db.select().from(events).where(eq(events.id, c.req.param("id"))).limit(1);
    if (!event) return httpError(c, 404, "not_found", "Event not found.");
    return c.json({ event });
  })
  .get("/rules", async (c) => c.json({ rules: await db.select().from(brandRuleVersions) }))
  .post("/rules", async (c) => {
    const body = await readBody(c);
    if (!body) return httpError(c, 400, "invalid_request", "JSON object body required.");
    const now = Date.now();
    const id = newId("rule");
    await db.insert(brandRuleVersions).values({
      id,
      family: String(body.family ?? "bloome"),
      version: Number(body.version ?? 1),
      status: String(body.status ?? "draft"),
      active: body.active ? 1 : 0,
      rulesJson: JSON.stringify(body.rules ?? baselineRules()),
      canonicalPaletteJson: JSON.stringify(body.canonicalPalette ?? baselineRules()[0].canonicalPalette ?? []),
      ownerNotes: typeof body.ownerNotes === "string" ? body.ownerNotes : null,
      createdBy: principalLabel(c.get("principal")),
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ id }, 201);
  })
  .patch("/rules/:id", async (c) => patchRow(c, brandRuleVersions, brandRuleVersions.id))
  .get("/keys", async (c) => c.json({ keys: await db.select().from(apiKeys) }))
  .post("/keys", async (c) => {
    const body = await readBody(c);
    const generated = await generateApiKey();
    const id = newId("key");
    await db.insert(apiKeys).values({ id, name: String(body?.name ?? "agent key"), keyHash: generated.hash, prefix: generated.prefix, createdBy: principalLabel(c.get("principal")), createdAt: Date.now() });
    return c.json({ id, key: generated.plaintext, prefix: generated.prefix }, 201);
  });

async function updateProfile(c: any, exceptionalRestore: boolean) {
  const body = await readBody(c);
  if (!body) return httpError(c, 400, "invalid_request", "JSON object body required.");
  const [current] = await db.select().from(teamProfiles).where(eq(teamProfiles.userId, c.req.param("userId"))).limit(1);
  if (!current) return httpError(c, 404, "not_found", "Profile not found.");
  try {
    const next = nextProfileState(current as never, {
      approvalStatus: body.approvalStatus as never,
      role: body.role as never,
      reason: typeof body.reason === "string" ? body.reason : null,
      actor: principalLabel(c.get("principal")),
      lockVersion: Number(body.lockVersion),
      exceptionalRestore,
    });
    await db.update(teamProfiles).set(next).where(eq(teamProfiles.userId, c.req.param("userId")));
    return c.json({ profile: next });
  } catch (error) {
    return httpError(c, 400, error instanceof Error ? error.message : "profile_update_failed", "Profile update failed.");
  }
}

async function readBody(c: any): Promise<Record<string, unknown> | null> {
  const body = await c.req.json().catch(() => null);
  return isRecord(body) ? body : null;
}

async function patchRow(c: any, table: any, idCol: any) {
  const body = await readBody(c);
  if (!body || !Number.isInteger(body.lockVersion)) return httpError(c, 400, "lock_version_required", "lockVersion is required.");
  const { lockVersion, ...updates } = body;
  const [current] = (await db.select().from(table)).filter((row: any) => row.id === c.req.param("id"));
  if (!current) return httpError(c, 404, "not_found", "Row not found.");
  if (Number(current.lockVersion ?? 0) !== Number(lockVersion)) return httpError(c, 409, "lock_version_conflict", "Row lockVersion is stale.");
  const result = await db.update(table).set({ ...updates, lockVersion: Number(lockVersion) + 1, updatedAt: Date.now() }).where(and(eq(idCol, c.req.param("id")), eq(table.lockVersion, Number(lockVersion))));
  if (await updateMissed(result)) {
    const [latest] = await db.select().from(table).where(eq(idCol, c.req.param("id"))).limit(1);
    return httpError(c, 409, "lock_version_conflict", "Row lockVersion is stale.", { current: latest ?? null });
  }
  return c.json({ ok: true });
}

function principalLabel(principal: AppEnv["Variables"]["principal"]): string {
  return principal.kind === "owner" ? principal.email ?? "owner" : principal.kind === "agent" ? principal.keyId : principal.userId;
}

function parseTimeQuery(value: string | undefined): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  const asDate = Date.parse(value);
  return Number.isFinite(asDate) ? asDate : null;
}

async function updateMissed(result: unknown): Promise<boolean> {
  const affected = affectedRows(result);
  if (affected !== null) return affected === 0;
  throw new Error("driver_lacks_row_count");
}

function affectedRows(result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, any>;
  return Number.isInteger(r.rowsAffected) ? r.rowsAffected : Number.isInteger(r.changes) ? r.changes : Number.isInteger(r.meta?.changes) ? r.meta.changes : null;
}
