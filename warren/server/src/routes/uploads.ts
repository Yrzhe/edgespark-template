import { Hono } from "hono";
import type { AppEnv } from "../middleware/adminAuth";
import { requireAdmin } from "../middleware/adminAuth";
import { requireAgent } from "../middleware/agentAuth";
import { httpError } from "../lib/httpErrors";
import { isRecord, readJson } from "../lib/json";
import { confirmUpload, createPresignedUpload, validateUploadRequest, type UploadKind, type UploadOwner } from "../lib/uploads";

export const uploadRoutes = new Hono<AppEnv>()
  .post("/uploads/presign", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object required.");
    const parsed = validateUploadRequest({
      kind: body.kind,
      contentType: body.content_type ?? body.contentType,
      size: body.size,
      filename: body.filename,
    });
    if (!parsed.ok) return httpError(c, parsed.status ?? 400, parsed.code, parsed.message);

    const owner = await requireUploadOwner(c, parsed.kind);
    if (owner instanceof Response) return owner;
    const presigned = await createPresignedUpload({
      kind: parsed.kind,
      owner,
      contentType: parsed.contentType,
      extension: parsed.extension,
    });
    return c.json({
      kind: parsed.kind,
      content_type: parsed.contentType,
      max_bytes: 10 * 1024 * 1024,
      ...presigned,
    }, 201);
  })
  .post("/uploads/confirm", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.key !== "string") {
      return httpError(c, 400, "invalid_request", "key is required.");
    }
    const kind = typeof body.kind === "string" ? body.kind : kindFromKey(body.key);
    if (!isUploadKindLocal(kind)) return httpError(c, 400, "invalid_kind", "kind is required or key must include a valid kind.");

    const owner = await requireUploadOwner(c, kind);
    if (owner instanceof Response) return owner;
    const result = await confirmUpload({ key: body.key, kind, owner });
    if (!result.ok) return httpError(c, result.status ?? 400, result.code, result.message);
    return c.json(result, 201);
  });

async function requireUploadOwner(c: Parameters<typeof requireAgent>[0], kind: UploadKind): Promise<UploadOwner | Response> {
  if (kind === "ad-image") {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    return { ownerKind: "admin", ownerId: "admin" };
  }
  const agent = await requireAgent(c, { write: true });
  if (agent instanceof Response) return agent;
  return { ownerKind: "agent", ownerId: agent.id };
}

function kindFromKey(key: string): string | null {
  return key.split("/")[2] ?? null;
}

function isUploadKindLocal(value: unknown): value is UploadKind {
  return value === "avatar" || value === "post-image" || value === "comment-image" || value === "ad-image";
}
