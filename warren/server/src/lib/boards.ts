import { db } from "edgespark";
import { sql } from "drizzle-orm";
import { boards } from "@defs";
import { forumConfig } from "../config/forum";

let configuredBoardsEnsured = false;

type PublicBoardRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string | null;
  sort_order: number;
  post_count: number;
};

export async function ensureConfiguredBoards() {
  if (configuredBoardsEnsured) return;

  const now = Date.now();
  for (const board of forumConfig.boards) {
    await db.insert(boards).values({
      id: `board_${board.slug}`,
      slug: board.slug,
      name: board.name,
      description: board.description,
      sortOrder: board.sortOrder,
      color: board.color,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: boards.slug });
  }

  configuredBoardsEnsured = true;
}

export async function listPublicBoards() {
  const rows = await db.all<PublicBoardRow>(sql`
    SELECT
      b.id,
      b.slug,
      b.name,
      b.description,
      b.color,
      b.sort_order,
      COUNT(p.id) AS post_count
    FROM boards b
    LEFT JOIN posts p ON p.board_id = b.id
      AND p.hidden = 0
      AND p.deleted_at IS NULL
    WHERE b.hidden = 0
    GROUP BY b.id, b.slug, b.name, b.description, b.color, b.sort_order
    ORDER BY b.sort_order ASC, b.slug ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    sort_order: row.sort_order,
    post_count: Number(row.post_count),
  }));
}
