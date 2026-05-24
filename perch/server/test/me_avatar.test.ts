import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const state = vi.hoisted(() => ({
  authUser: null as null | { email: string | null },
  ownerEmail: "owner@example.com",
  ownerSettings: null as null | { id: string; avatarS3Uri: string | null; updatedAt: number },
  head: null as null | { contentType?: string | null; size: number },
  presignedPut: null as null | { key: string; contentType?: string },
  presignedGetPath: null as null | string,
  deleted: [] as string[],
}));

vi.mock("edgespark/http", () => ({
  auth: {
    get user() {
      return state.authUser;
    },
    isAuthenticated() {
      return !!state.authUser;
    },
  },
}));

vi.mock("edgespark", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.ownerSettings ? [{ avatarS3Uri: state.ownerSettings.avatarS3Uri }] : [],
        }),
      }),
    }),
    update: () => ({
      set: (values: { avatarS3Uri: string; updatedAt: number }) => ({
        where: () => ({
          returning: async () => {
            if (!state.ownerSettings) return [];
            state.ownerSettings = { id: "owner", ...values };
            return [{ id: "owner" }];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: { id: string; avatarS3Uri: string; updatedAt: number }) => ({
        returning: async () => {
          state.ownerSettings = values;
          return [{ id: values.id }];
        },
      }),
    }),
  },
  storage: {
    from: () => ({
      createPresignedPutUrl: async (key: string, _ttl: number, options?: { contentType?: string }) => {
        state.presignedPut = { key, contentType: options?.contentType };
        return { uploadUrl: `https://upload.example/${key}`, requiredHeaders: { "content-type": options?.contentType ?? "" } };
      },
      head: async () => state.head,
      delete: async (key: string) => {
        state.deleted.push(key);
      },
      createPresignedGetUrl: async (path: string, ttl: number) => {
        state.presignedGetPath = `${path}:${ttl}`;
        return { downloadUrl: `https://download.example/${path}?ttl=${ttl}` };
      },
    }),
    createS3Uri: (_bucket: unknown, path: string) => `s3://perch-media/${path}`,
    tryParseS3Uri: (value: string) => {
      const prefix = "s3://perch-media/";
      if (!value.startsWith(prefix)) return null;
      return { bucket: { bucket_name: "perch-media" }, path: value.slice(prefix.length) };
    },
  },
  vars: { get: () => state.ownerEmail },
  secret: { get: () => "test-secret" },
  ctx: { environment: "production" },
}));

vi.mock("@defs", () => ({
  buckets: { perchMedia: { bucket_name: "perch-media" } },
  ownerSettings: {
    id: "id",
    avatarS3Uri: "avatarS3Uri",
    updatedAt: "updatedAt",
  },
}));

describe("owner avatar upload", () => {
  beforeEach(() => {
    vi.resetModules();
    state.authUser = { email: "owner@example.com" };
    state.ownerEmail = "owner@example.com";
    state.ownerSettings = null;
    state.head = null;
    state.presignedPut = null;
    state.presignedGetPath = null;
    state.deleted = [];
  });

  it("requires the owner session for avatar presign", async () => {
    state.authUser = { email: "other@example.com" };
    const app = await appWithMeRoutes();

    const res = await app.request("/api/me/avatar/presign", {
      method: "POST",
      body: JSON.stringify({ contentType: "image/png" }),
      headers: { "content-type": "application/json" },
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("not_owner");
  });

  it("presigns only supported image uploads under owner/avatar", async () => {
    const app = await appWithMeRoutes();

    const invalid = await app.request("/api/me/avatar/presign", {
      method: "POST",
      body: JSON.stringify({ contentType: "text/html" }),
      headers: { "content-type": "application/json" },
    });
    expect(invalid.status).toBe(400);

    const valid = await app.request("/api/me/avatar/presign", {
      method: "POST",
      body: JSON.stringify({ contentType: "image/webp" }),
      headers: { "content-type": "application/json" },
    });
    const body = await valid.json();

    expect(valid.status).toBe(201);
    expect(body.key).toMatch(/^owner\/avatar\/[0-9a-f-]{36}\/avatar\.webp$/);
    expect(body.uploadUrl).toContain(body.key);
    expect(body.requiredHeaders).toEqual({ "content-type": "image/webp" });
    expect(state.presignedPut).toEqual({ key: body.key, contentType: "image/webp" });
  });

  it("confirms an uploaded image and persists the owner avatar S3 URI", async () => {
    const app = await appWithMeRoutes();
    const key = "owner/avatar/00000000-0000-4000-8000-000000000001/avatar.png";
    state.head = { contentType: "image/png", size: 42_000 };

    const res = await app.request("/api/me/avatar/confirm", {
      method: "POST",
      body: JSON.stringify({ key }),
      headers: { "content-type": "application/json" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ avatarS3Uri: `s3://perch-media/${key}` });
    expect(state.ownerSettings?.avatarS3Uri).toBe(`s3://perch-media/${key}`);
  });

  it("rejects invalid confirmed uploads by head metadata", async () => {
    const app = await appWithMeRoutes();
    const key = "owner/avatar/00000000-0000-4000-8000-000000000001/avatar.gif";
    state.head = { contentType: "image/gif", size: 5 * 1024 * 1024 };

    const tooLarge = await app.request("/api/me/avatar/confirm", {
      method: "POST",
      body: JSON.stringify({ key }),
      headers: { "content-type": "application/json" },
    });

    expect(tooLarge.status).toBe(413);
    expect(state.deleted).toEqual([key]);
  });

  it("returns a fresh presigned avatarUrl from GET /api/me", async () => {
    const app = await appWithMeRoutes();
    const path = "owner/avatar/00000000-0000-4000-8000-000000000001/avatar.jpg";
    state.ownerSettings = { id: "owner", avatarS3Uri: `s3://perch-media/${path}`, updatedAt: 100 };

    const res = await app.request("/api/me");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      email: "owner@example.com",
      avatarUrl: `https://download.example/${path}?ttl=900`,
    });
    expect(state.presignedGetPath).toBe(`${path}:900`);
  });
});

async function appWithMeRoutes() {
  const { meRoutes } = await import("../src/routes/me");
  const app = new Hono();
  app.route("/api/me", meRoutes);
  return app;
}
