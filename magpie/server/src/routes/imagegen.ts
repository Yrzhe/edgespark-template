import { Hono } from "hono";
import { db } from "edgespark";
import { assets } from "@defs";
import { imagegenCreate, imagegenErrorResponse, type ImagegenMode } from "../lib/imagegen/openai";
import { storeGeneratedPng } from "../lib/imagegen/store";
import { triggerAssetDescription } from "../lib/description/autotag";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord } from "../lib/json";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";
import { parseReferenceAssetIds, ReferenceAssetError, resolveReferenceAssets } from "../lib/imagegen/references";

export const imagegenRoutes = new Hono<AppEnv>()
  .post("/imagegen", approvedUserOrAgentKey, async (c) => {
    const principal = c.get("principal");
    const userId = principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body) || typeof body.prompt !== "string" || !isRecord(body.dims)) return httpError(c, 400, "invalid_request", "prompt and dims are required.");
    try {
      const referenceAssetIds = parseReferenceAssetIds(body.referenceAssetIds);
      const referenceAssets = await resolveReferenceAssets(userId, referenceAssetIds, db);
      const result = await imagegenCreate({
        prompt: body.prompt,
        dims: { width: Number(body.dims.width), height: Number(body.dims.height) },
        mode: body.mode === "opaque" ? "opaque" : body.mode === "transparent" ? "transparent" : undefined,
        activePaletteId: typeof body.activePaletteId === "string" ? body.activePaletteId : null,
        userId,
        quality: body.quality === "medium" ? "medium" : "high",
        referenceAssets,
      });
      const id = newId("asset");
      const now = Date.now();
      const s3Uri = await storeGeneratedPng(id, result.png);
      await db.insert(assets).values({
        id,
        kind: "image",
        source: "agent-gen",
        folderId: typeof body.folderId === "string" ? body.folderId : null,
        ownerUserId: userId,
        name: String(body.name ?? "Agent generated asset"),
        s3Uri,
        contentType: "image/png",
        byteSize: result.png.byteLength,
        width: Number(body.dims.width),
        height: Number(body.dims.height),
        transparent: result.mode === "transparent" ? 1 : 0,
        tagsJson: JSON.stringify(["agent-gen", result.mode] satisfies string[]),
        provenanceJson: JSON.stringify({ prompt: body.prompt, mode: result.mode satisfies ImagegenMode, paletteId: result.paletteId, referenceAssetIds: referenceAssetIds ?? [] }),
        createdAt: now,
        updatedAt: now,
      });
      triggerAssetDescription({ assetId: id, s3Uri, userId, agentRunId: null });
      return c.json({ asset_id: id, mode: result.mode, model: result.model, content_type: "image/png", pngBase64: bytesToBase64(result.png) }, 201);
    } catch (error) {
      if (error instanceof ReferenceAssetError) return httpError(c, error.status, error.code, error.message);
      return imagegenErrorResponse(c, error);
    }
  });

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
