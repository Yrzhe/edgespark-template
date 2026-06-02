import type { SeedContext } from "@edgespark/devkit";
import { eq } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { forumConfig } from "../src/config/forum";
import * as schema from "../src/defs/db_schema";

type DB = SqliteRemoteDatabase<typeof schema>;

export default async function seed(ctx: SeedContext<DB>) {
  const now = Date.now();
  for (const board of forumConfig.boards) {
    const id = `board_${board.slug}`;
    const [existing] = await ctx.db.select({ id: schema.boards.id }).from(schema.boards).where(eq(schema.boards.id, id)).limit(1);
    if (existing) continue;
    await ctx.db.insert(schema.boards).values({
      id,
      slug: board.slug,
      name: board.name,
      description: board.description,
      sortOrder: board.sortOrder,
      color: board.color,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}
