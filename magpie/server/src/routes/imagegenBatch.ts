import { Hono } from "hono";
import { db } from "edgespark";
import { httpError } from "../lib/httpErrors";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";
import { emptyStyle, resolveCardStyle, runBatchImagegen, validateBatchInput } from "../lib/imagegen/batch";

export const imagegenBatchRoutes = new Hono<AppEnv>()
  .post("/imagegen/batch", approvedUserOrAgentKey, async (c) => {
    const principal = c.get("principal");
    const userId = principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");

    const body = await c.req.json().catch(() => null);
    const validated = validateBatchInput(body);
    if (!validated.ok) return httpError(c, 400, validated.code, validated.message);
    const input = validated.value;

    let style = emptyStyle();
    if (input.cardId) {
      const resolved = await resolveCardStyle(db, userId, input.cardId);
      if (!resolved.found) return httpError(c, 404, "card_not_found", "Card not found.");
      style = resolved.style;
    }

    try {
      const result = await runBatchImagegen(
        { userId, prompt: input.prompt, count: input.count, model: input.model, transparent: input.transparent, style, dims: input.dims, folderId: input.folderId },
        db,
      );
      if (result.generated === 0) return httpError(c, 502, "imagegen_failed", "All image generations failed.");
      return c.json({ assetIds: result.assetIds, totalCostMicros: result.totalCostMicros, generated: result.generated, requested: result.requested }, 201);
    } catch (error) {
      const e = error as Error & { status?: number; quote?: unknown };
      if (e.status === 429) return httpError(c, 429, "budget_exhausted", "Daily image generation budget would be exceeded.", { quote: e.quote });
      return httpError(c, 502, "imagegen_failed", e.message || "Batch image generation failed.");
    }
  });
