import { db } from "edgespark";
import { boards } from "@defs";
import { forumConfig } from "../config/forum";

let configuredBoardsEnsured = false;

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
