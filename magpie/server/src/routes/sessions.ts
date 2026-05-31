import { Hono } from "hono";
import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { agentRuns, agentSessions } from "@defs";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord } from "../lib/json";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";

export const sessionRoutes = new Hono<AppEnv>()
  .use("*", approvedUserOrAgentKey)
  .get("/sessions", async (c) => listSessions(c))
  .post("/sessions", async (c) => createSession(c))
  .get("/agent/sessions", async (c) => {
    return listSessions(c);
  })
  .post("/agent/sessions", async (c) => {
    return createSession(c);
  })
  .patch("/agent/sessions/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const session = await ownedSession(c.req.param("id"), userId);
    if (!session) return httpError(c, 404, "not_found", "Session not found.");
    if (!Number.isInteger(body.lockVersion) || Number(body.lockVersion) !== Number(session.lockVersion ?? 0)) return httpError(c, 409, "lock_version_conflict", "Session lockVersion is stale.");
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof body.title === "string") update.title = body.title;
    if (body.archived === true) update.archivedAt = Date.now();
    update.lockVersion = Number(body.lockVersion) + 1;
    const result = await db.update(agentSessions).set(update).where(and(eq(agentSessions.id, c.req.param("id")), eq(agentSessions.lockVersion, Number(body.lockVersion))));
    if (await updateMissed(result)) {
      const current = await sessionById(c.req.param("id"));
      return httpError(c, 409, "lock_version_conflict", "Session lockVersion is stale.", { current });
    }
    return c.json({ ok: true });
  })
  .delete("/agent/sessions/:id", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const lockVersion = Number(c.req.query("lockVersion"));
    const session = await ownedSession(c.req.param("id"), userId);
    if (!session) return httpError(c, 404, "not_found", "Session not found.");
    if (!Number.isInteger(lockVersion) || lockVersion !== Number(session.lockVersion ?? 0)) return httpError(c, 409, "lock_version_conflict", "Session lockVersion is stale.");
    const result = await db.update(agentSessions).set({ deletedAt: Date.now(), updatedAt: Date.now(), lockVersion: lockVersion + 1 }).where(and(eq(agentSessions.id, c.req.param("id")), eq(agentSessions.lockVersion, lockVersion)));
    if (await updateMissed(result)) {
      const current = await sessionById(c.req.param("id"));
      return httpError(c, 409, "lock_version_conflict", "Session lockVersion is stale.", { current });
    }
    return c.json({ ok: true });
  })
  .get("/agent/sessions/:id/runs", async (c) => {
    const userId = principalUserId(c.get("principal"));
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const session = await ownedSession(c.req.param("id"), userId);
    if (!session) return httpError(c, 404, "not_found", "Session not found.");
    return c.json({ runs: (await db.select().from(agentRuns)).filter((row: any) => row.sessionId === c.req.param("id") && row.userId === userId) });
  });

export async function listSessions(c: any) {
  const principal = c.get("principal");
  const userId = principalUserId(principal);
  if (!userId) return httpError(c, 401, "user_required", "User principal required.");
  const rows = (await db.select().from(agentSessions)).filter((row: any) => row.userId === userId && !row.deletedAt);
  return c.json({ sessions: rows });
}

export async function createSession(c: any) {
  const principal = c.get("principal");
  const userId = principalUserId(principal);
  if (!userId) return httpError(c, 401, "user_required", "User principal required.");
  const body = await c.req.json().catch(() => ({}));
  const now = Date.now();
  const id = newId("sess");
  await db.insert(agentSessions).values({ id, userId, title: isRecord(body) && typeof body.title === "string" ? body.title : "New session", createdAt: now, updatedAt: now, lockVersion: 0 });
  return c.json({ id }, 201);
}

function principalUserId(principal: AppEnv["Variables"]["principal"]): string | null {
  return principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
}

async function ownedSession(id: string, userId: string) {
  return (await db.select().from(agentSessions)).find((row: any) => row.id === id && row.userId === userId && !row.deletedAt);
}

async function sessionById(id: string) {
  return (await db.select().from(agentSessions)).find((row: any) => row.id === id) ?? null;
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
