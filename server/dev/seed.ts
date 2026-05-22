/**
 * Local dev seed (runs on `edgespark dev`). Creates the owner account and a KNOWN
 * agent API key so local e2e + the dashboard have a working bearer immediately.
 *
 * The fixed key below is for LOCAL DEV ONLY — never deploy it. Plan 5 may extend this
 * with a demo site + BaaS collection/records for a populated first-run dashboard.
 */
import { defineSeed } from "@edgespark/devkit";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import type * as schema from "../src/defs/db_schema";
import { apiKeys } from "../src/defs/db_schema";
import { hashKey } from "../src/lib/keys";
import { newId } from "../src/lib/ids";

const E2E_KEY = "esk_LOCAL_DEV_E2E_KEY_do_not_use_in_prod";

export default defineSeed<SqliteRemoteDatabase<typeof schema>>(async (ctx) => {
  // Owner account — matches OWNER_EMAIL in .env.local.
  await ctx.auth.createUser({
    email: "owner@example.com",
    password: "correct-horse-battery-staple",
    name: "Owner",
  });

  // Known agent API key for local e2e (stored as hash, like production).
  const keyHash = await hashKey(E2E_KEY);
  const existing = await ctx.db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  if (existing.length === 0) {
    await ctx.db.insert(apiKeys).values({
      id: newId(),
      name: "local-e2e",
      keyHash,
      prefix: E2E_KEY.slice(0, 12),
      createdAt: Date.now(),
    });
  }
  console.log(`[seed] local e2e agent API key: ${E2E_KEY}`);
});
