import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { agentRuns } from "@defs";
import { sessionRoutes } from "../src/routes/sessions";

describe("agent sessions", () => {
  beforeEach(() => {
    db._reset();
    auth.user = { id: "owner", email: "owner@youware.com" };
  });

  it("creates, archives, and lists runs in a user session", async () => {
    const app = new Hono().route("/api/public", sessionRoutes);
    const created = await app.request("/api/public/agent/sessions", { method: "POST", body: JSON.stringify({ title: "Launch" }) });
    const id = (await created.json()).id;
    db._seed(agentRuns, [{ id: "run1", userId: "owner", sessionId: id, prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", createdAt: 1 }]);
    const runs = await app.request(`/api/public/agent/sessions/${id}/runs`);
    expect((await runs.json()).runs).toHaveLength(1);
    const archived = await app.request(`/api/public/agent/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true, lockVersion: 0 }) });
    expect(archived.status).toBe(200);
    expect(db._tables.get("agent_sessions")?.[0].archivedAt).toBeTypeOf("number");
  });

  it("session PATCH returns 409 on stale lockVersion", async () => {
    const app = new Hono().route("/api/public", sessionRoutes);
    const created = await app.request("/api/public/agent/sessions", { method: "POST", body: JSON.stringify({ title: "Launch" }) });
    const id = (await created.json()).id;
    db._tables.get("agent_sessions")![0].lockVersion = 2;
    const res = await app.request(`/api/public/agent/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title: "Stale", lockVersion: 1 }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("lock_version_conflict");
  });
});
