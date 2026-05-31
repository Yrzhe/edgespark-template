import { Hono } from "hono";
import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { palettes } from "@defs";
import { canonicalPaletteRow, ensureCanonicalPalette } from "../lib/palettes";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord } from "../lib/json";
import { approvedUserOrAgentKey, ownerSessionOrOwnerToken, type AppEnv } from "../middleware/managementAuth";

export const paletteRoutes = new Hono<AppEnv>()
  .get("/palettes", approvedUserOrAgentKey, async (c) => {
    await ensureCanonicalPalette(db);
    return c.json({ palettes: (await db.select().from(palettes)).filter((row: any) => !row.deletedAt) });
  });

export const managePaletteRoutes = new Hono<AppEnv>()
  .use("*", ownerSessionOrOwnerToken)
  .post("/palettes", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body) || typeof body.name !== "string" || !Array.isArray(body.colors)) return httpError(c, 400, "invalid_request", "name and colors are required.");
    const now = Date.now();
    const id = newId("pal");
    await db.insert(palettes).values({ id, name: body.name, kind: String(body.kind ?? "team"), locked: 0, colorsJson: JSON.stringify(body.colors), ownerId: "owner", createdAt: now, updatedAt: now });
    return c.json({ id }, 201);
  })
  .patch("/palettes/:id", async (c) => {
    const [row] = await db.select().from(palettes).where(eq(palettes.id, c.req.param("id"))).limit(1);
    if (!row) return httpError(c, 404, "not_found", "Palette not found.");
    if (row.locked) return httpError(c, 409, "locked_palette", "Locked canonical palettes cannot be modified.");
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
    if (!Number.isInteger(body.lockVersion)) return httpError(c, 400, "lock_version_required", "lockVersion is required.");
    if (Number(body.lockVersion) !== Number(row.lockVersion ?? 0)) return httpError(c, 409, "lock_version_conflict", "Palette lockVersion is stale.");
    const update: Record<string, unknown> = { updatedAt: Date.now(), lockVersion: Number(body.lockVersion) + 1 };
    if (typeof body.name === "string") update.name = body.name;
    if (Array.isArray(body.colors)) update.colorsJson = JSON.stringify(body.colors);
    const result = await db.update(palettes).set(update).where(and(eq(palettes.id, row.id), eq(palettes.lockVersion, Number(body.lockVersion))));
    if (await updateMissed(result)) {
      const [current] = await db.select().from(palettes).where(eq(palettes.id, row.id)).limit(1);
      return httpError(c, 409, "lock_version_conflict", "Palette lockVersion is stale.", { current: current ?? null });
    }
    return c.json({ ok: true });
  })
  .delete("/palettes/:id", async (c) => {
    const [row] = await db.select().from(palettes).where(eq(palettes.id, c.req.param("id"))).limit(1);
    if (!row) return httpError(c, 404, "not_found", "Palette not found.");
    if (row.locked || row.id === canonicalPaletteRow().id) return httpError(c, 409, "locked_palette", "Locked canonical palettes cannot be deleted.");
    await db.update(palettes).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(eq(palettes.id, row.id));
    return c.json({ ok: true });
  });

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
