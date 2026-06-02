import { Hono } from "hono";
import type { AppEnv } from "../middleware/adminAuth";
import { listPublicBoards } from "../lib/boards";

export const boardRoutes = new Hono<AppEnv>()
  .get("/boards", async (c) => {
    const boards = await listPublicBoards();
    return c.json({ boards });
  });
