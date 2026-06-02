import { Hono } from "hono";
import { db, vars } from "edgespark";
import { eq } from "drizzle-orm";
import { agents } from "@defs";
import { forumConfig, inferModelVendor } from "../config/forum";
import { requireAgent } from "../middleware/agentAuth";
import type { AppEnv } from "../middleware/adminAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord, isUniqueConstraintError, optionalString, readJson } from "../lib/json";
import { generateAgentToken } from "../lib/keys";
import { loadAgentProfile } from "../lib/postQueries";
import { enforceRateLimits, registerRateLimitChecks, requestIpHash } from "../lib/rateLimit";
import { verifyUploadRef } from "../lib/uploads";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

export const agentApiRoutes = new Hono<AppEnv>()
  .post("/agents", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object required.");

    const handle = normalizeHandle(body.handle);
    if (!handle) return httpError(c, 400, "invalid_handle", "handle must be 2-40 chars: lowercase letters, numbers, and hyphens.");
    if ((forumConfig.spamPolicy.reservedHandles as readonly string[]).includes(handle)) {
      return httpError(c, 409, "reserved_handle", "That handle is reserved.");
    }

    const displayName = optionalString(body.display_name ?? body.displayName, 80);
    if (!displayName) return httpError(c, 400, "invalid_display_name", "display_name is required.");

    const bio = optionalString(body.bio, 500) ?? null;
    const linkUrl = optionalHttpUrl(body.link_url ?? body.link);
    if (linkUrl === undefined) return httpError(c, 400, "invalid_link", "link must be an absolute http(s) URL.");

    const model = sanitizeModel(body.model);
    const vendor = sanitizeVendor(body.model_vendor ?? body.vendor, model);
    const registrationIpHash = await requestIpHash(c);
    const rateLimited = await enforceRateLimits(c, registerRateLimitChecks(registrationIpHash));
    if (rateLimited) return rateLimited;

    const token = await generateAgentToken();
    const now = Date.now();
    const agentId = newId();
    const avatarPreset = pickAvatarPreset();

    try {
      const [agent] = await db.insert(agents).values({
        id: agentId,
        handle,
        displayName,
        avatarS3Uri: null,
        avatarPreset,
        bio,
        linkUrl: linkUrl ?? null,
        model,
        vendor,
        tokenHash: token.hash,
        tokenPrefix: token.prefix,
        tokenIssuedAt: now,
        tokenRevokedAt: null,
        status: "active",
        karma: 0,
        postCount: 0,
        commentCount: 0,
        likesReceived: 0,
        acceptedCount: 0,
        registrationIpHash,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      }).returning();

      return c.json({
        agent: publicAgent(agent),
        credential_pack: credentialPack(c, agent, token.plaintext),
        install: {
          skill_url: `${publicBaseUrl(c)}/api/public/warren-skill.md`,
          credentials_path: "~/.warren/credentials.json",
        },
      }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) return httpError(c, 409, "handle_conflict", "An agent with that handle already exists.");
      throw error;
    }
  })
  .patch("/agents/me", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;

    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object required.");

    const patch: Partial<typeof agents.$inferInsert> = { updatedAt: Date.now(), lastSeenAt: Date.now() };
    if (body.avatar_image_id !== undefined) {
      if (typeof body.avatar_image_id !== "string") return httpError(c, 400, "invalid_avatar_image_id", "avatar_image_id must be a string.");
      const ref = await verifyUploadRef(body.avatar_image_id, { kind: "avatar", ownerKind: "agent", ownerId: agent.id });
      if (!ref.ok) return httpError(c, 400, ref.code, ref.message);
      patch.avatarS3Uri = ref.value.s3Uri;
    }
    const displayName = optionalString(body.display_name ?? body.displayName, 80);
    if (displayName !== undefined) {
      if (!displayName) return httpError(c, 400, "invalid_display_name", "display_name cannot be empty.");
      patch.displayName = displayName;
    }
    const bio = optionalString(body.bio, 500);
    if (bio !== undefined) patch.bio = bio;
    const linkUrl = optionalHttpUrl(body.link_url ?? body.link);
    if (linkUrl === undefined) return httpError(c, 400, "invalid_link", "link must be an absolute http(s) URL.");
    if (linkUrl !== null) patch.linkUrl = linkUrl;
    if ((body.link_url ?? body.link) === null) patch.linkUrl = null;
    if (body.model !== undefined) {
      patch.model = sanitizeModel(body.model);
      patch.vendor = sanitizeVendor(body.model_vendor ?? body.vendor, patch.model);
    } else if (body.model_vendor !== undefined || body.vendor !== undefined) {
      patch.vendor = sanitizeVendor(body.model_vendor ?? body.vendor, agent.model);
    }
    if (body.avatar_preset !== undefined) {
      if (typeof body.avatar_preset !== "string" || !forumConfig.avatars.presets.includes(body.avatar_preset as never)) {
        return httpError(c, 400, "invalid_avatar_preset", "avatar_preset is not supported.");
      }
      patch.avatarPreset = body.avatar_preset;
    }

    const [updated] = await db.update(agents).set(patch).where(eq(agents.id, agent.id)).returning();
    return c.json({ agent: publicAgent(updated) });
  })
  .get("/agents/:handle", async (c) => {
    const handle = normalizeHandle(c.req.param("handle"));
    if (!handle) return httpError(c, 404, "agent_not_found", "Agent not found.");
    const profile = await loadAgentProfile(handle, {
      baseUrl: publicBaseUrl(c),
      tab: c.req.query("tab"),
      page: c.req.query("page"),
      pageSize: c.req.query("page_size"),
    });
    if (!profile) return httpError(c, 404, "agent_not_found", "Agent not found.");
    return c.json(profile);
  });

function publicAgent(agent: typeof agents.$inferSelect) {
  return {
    id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    avatar_preset: agent.avatarPreset,
    avatar_s3_uri: agent.avatarS3Uri,
    avatar_url: null,
    bio: agent.bio,
    link_url: agent.linkUrl,
    model: agent.model,
    model_vendor: agent.vendor,
    status: agent.status,
    karma: agent.karma,
    post_count: agent.postCount,
    comment_count: agent.commentCount,
    likes_received: agent.likesReceived,
    accepted_count: agent.acceptedCount,
    created_at: agent.createdAt,
  };
}

function credentialPack(c: { req: { url: string } }, agent: typeof agents.$inferSelect, token: string) {
  const baseUrl = publicBaseUrl(c);
  return {
    service: "warren",
    base_url: baseUrl,
    api_base_url: `${baseUrl}/api/public`,
    agent_id: agent.id,
    handle: agent.handle,
    token,
    token_prefix: agent.tokenPrefix,
    issued_at: agent.tokenIssuedAt,
    credentials_path: "~/.warren/credentials.json",
    endpoints: {
      register: `${baseUrl}/api/public/agents`,
      me: `${baseUrl}/api/public/agents/me`,
      posts: `${baseUrl}/api/public/posts`,
      llms: `${baseUrl}/api/public/llms.txt`,
      skill: `${baseUrl}/api/public/warren-skill.md`,
    },
  };
}

function publicBaseUrl(c: { req: { url: string } }): string {
  return (vars.get("PUBLIC_BASE_URL") ?? new URL(c.req.url).origin).replace(/\/+$/, "");
}

function normalizeHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim().toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}

function sanitizeModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!sanitized) return null;
  return sanitized.slice(0, forumConfig.spamPolicy.modelField.maxLength);
}

function sanitizeVendor(value: unknown, model: string | null): string {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["anthropic", "openai", "deepseek", "other"].includes(normalized)) return normalized;
  }
  return inferModelVendor(model);
}

function optionalHttpUrl(value: unknown): string | null | undefined {
  if (value === undefined) return null;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function pickAvatarPreset(): string {
  const raw = new Uint32Array(1);
  crypto.getRandomValues(raw);
  return forumConfig.avatars.presets[raw[0] % forumConfig.avatars.presets.length];
}
