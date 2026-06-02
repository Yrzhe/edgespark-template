import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { db, secret } from "edgespark";
import { auth } from "edgespark/http";
import { agentRuns, apiKeys, brandRuleVersions, cardRuleReports, cards, teamProfiles } from "@defs";
import { agentRunRoutes, cardRoutes } from "../src/routes/cards";
import { baselineRules } from "../src/lib/rules/engine";
import { hashKey } from "../src/lib/keys";

describe("cards v3", () => {
  beforeEach(() => {
    db._reset();
    auth.user = { id: "owner", email: "owner@youware.com" };
    db._seed(brandRuleVersions, [{ id: "rule1", rulesJson: JSON.stringify(baselineRules()), active: 1 }]);
    db._seed(agentRuns, [
      { id: "run1", userId: "owner", planJson: JSON.stringify({ ruleVersionAtSave: "rule1" }), prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", createdAt: 1 },
      { id: "run2", userId: "owner", plannedParentCardId: null, planJson: JSON.stringify({ ruleVersionAtSave: "rule1" }), prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", createdAt: 1 },
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    secret.values.delete("OPENAI_API_KEY");
    auth.user = undefined;
  });

  it("forces failing ready saves to draft and writes a rule report", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    const res = await app.request("/api/public/cards", {
      method: "POST",
      body: JSON.stringify({ title: "Card", status: "ready", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1", draftForRules: {} }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("rule_report_failed");
    expect(json.cardDraft.status).toBe("draft");
    expect(db._tables.get("cards")?.[0].status).toBe("draft");
    expect(db._tables.get("card_rule_reports")?.length).toBe(1);
  });

  it("sets card family roots when deriving", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Root", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    const root = db._tables.get("cards")?.[0];
    db._tables.get("agent_runs")![1].plannedParentCardId = root.id;
    const res = await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Child", status: "draft", parentCardId: root.id, ratioPreset: "ig-post", agentRunId: "run2", ruleVersionAtSave: "rule1" }) });
    expect(res.status).toBe(201);
    const child = db._tables.get("cards")?.[1];
    expect(child.parentCardId).toBe(root.id);
    expect(child.cardRootId).toBe(root.id);
  });

  it("card PATCH returns 409 on stale lockVersion", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Root", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    const card = db._tables.get("cards")![0];
    card.lockVersion = 2;
    const res = await app.request(`/api/public/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Stale", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1", lockVersion: 1 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("lock_version_conflict");
  });

  it("accepts partial card PATCH title and aspect_ratio without lockVersion", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Root", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    const card = db._tables.get("cards")![0];
    const titleRes = await app.request(`/api/public/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed card" }),
    });
    expect(titleRes.status).toBe(200);
    expect((await titleRes.json()).card.name).toBe("Renamed card");
    const aspectRes = await app.request(`/api/public/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ aspect_ratio: "16:9" }),
    });
    expect(aspectRes.status).toBe(200);
    const json = await aspectRes.json();
    expect(json.card).toMatchObject({ width: 1200, height: 675 });
    expect(db._tables.get("cards")![0]).toMatchObject({ title: "Renamed card", ratioPreset: "wechat-banner", width: 1200, height: 675 });
  });

  it("dedupes compose cost rows for repeated saves on the same card within 24h", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Root", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    const card = db._tables.get("cards")![0];
    const firstCostCount = db._tables.get("cost_ledger")?.length ?? 0;
    const res = await app.request(`/api/public/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Full save", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }),
    });
    expect(res.status).toBe(200);
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(firstCostCount);
  });

  it("POST /agent/runs does not write a cost row (compose is charged once at card-save)", async () => {
    const app = new Hono().route("/api/public/agent", agentRunRoutes);
    const res = await app.request("/api/public/agent/runs", { method: "POST", body: JSON.stringify({ prompt: "compose a card" }) });
    expect(res.status).toBe(202);
    // Regression (R5.5): the run pre-charged worker.compose AND card-save charged it again,
    // double-counting one logical compose into todayUsdSpent. The run must write zero rows.
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);
    const run = db._tables.get("agent_runs")?.at(-1);
    expect(run.costMicros).toBe(1000); // quoted estimate retained for the UI only
  });

  it("charges exactly one compose cost row for a single composed card", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Root", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(1);
    expect(db._tables.get("cost_ledger")?.[0].costMicros).toBe(1000);
  });

  it("provenance mismatch rejects save", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    db._seed(cards, []);
    db._tables.get("cards")?.push({ id: "parentA", cardRootId: "parentA", title: "A", status: "draft", creatorUserId: "owner", lockVersion: 0 });
    db._tables.get("cards")?.push({ id: "parentB", cardRootId: "parentB", title: "B", status: "draft", creatorUserId: "owner", lockVersion: 0 });
    db._tables.get("agent_runs")?.push({ id: "run3", userId: "owner", plannedParentCardId: "parentA", planJson: JSON.stringify({ ruleVersionAtSave: "rule1" }), prompt: "p", provider: "openai", model: "gpt-4o-mini", state: "done", createdAt: 1 });
    const res = await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Wrong parent", status: "draft", parentCardId: "parentB", ratioPreset: "ig-post", agentRunId: "run3", ruleVersionAtSave: "rule1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("provenance_mismatch");
  });

  it("allows scoped agent API keys to save attributed cards", async () => {
    db._seed(apiKeys, [{ id: "key1", keyHash: await hashKey("esk_test"), prefix: "esk_test", createdBy: "owner", revokedAt: null }]);
    const app = new Hono().route("/api/public", cardRoutes);
    const res = await app.request("/api/public/cards", {
      method: "POST",
      headers: { Authorization: "Bearer esk_test" },
      body: JSON.stringify({ title: "Agent card", status: "draft", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }),
    });
    expect(res.status).toBe(201);
    expect(db._tables.get("cards")?.at(-1).creatorUserId).toBe("owner");
  });

  it("GET /api/public/cards/:id returns own ready card with ruleReport through route middleware", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    seedCard("card_ready", { status: "ready" });
    db._seed(cardRuleReports, [
      { id: "report1", cardId: "card_ready", ruleVersionId: "rule1", reportJson: JSON.stringify({ pass: true, findings: [{ code: "ok" }] }), pass: 1, createdAt: 2 },
    ]);

    const res = await app.request("/api/public/cards/card_ready");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.card).toMatchObject({ id: "card_ready", name: "Ready", status: "ready", ownerUserId: "owner", lockVersion: 0 });
    expect(json.ruleReport).toMatchObject({ id: "report1", ruleVersionId: "rule1", passed: true, findings: [{ code: "ok" }] });
  });

  it("GET /api/public/cards/:id returns 404 for another user's draft through route middleware", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    seedCard("draft_other", { title: "Other draft", status: "draft", creatorUserId: "other" });

    const res = await app.request("/api/public/cards/draft_other");

    expect(res.status).toBe(404);
  });

  it("GET /api/public/cards/:id returns 404 for missing id through route middleware", async () => {
    const app = new Hono().route("/api/public", cardRoutes);

    const res = await app.request("/api/public/cards/missing");

    expect(res.status).toBe(404);
  });

  it("POST /api/public/cards/:id/suggest-layout returns clamped existing-layer geometry and writes one cost row", async () => {
    secret.values.set("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            layers: [
              { id: "headline", x: -30, y: 10, width: 900, height: 80, rotation: 999 },
              { id: "asset_main", x: 500, y: 350, width: 200, height: 100 },
              { id: "invented", x: 0, y: 0, width: 50, height: 50 },
            ],
            rationale: "Set a clear headline and primary asset hierarchy.",
          }),
        },
      }],
    }), { status: 200 }));
    seedCard("card_layout", {
      width: 600,
      height: 400,
      cardSpecJson: JSON.stringify({
        layers: [
          { id: "headline", kind: "text", textValue: "Launch faster", x: 20, y: 20, width: 200, height: 60 },
          { id: "asset_main", kind: "asset", assetId: "asset_leaf", x: 260, y: 120, width: 160, height: 160 },
        ],
      }),
    });
    const originalSpec = db._tables.get("cards")![0].cardSpecJson;
    const app = new Hono().route("/api/public", cardRoutes);

    const res = await app.request("/api/public/cards/card_layout/suggest-layout", { method: "POST" });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.layers).toEqual([
      { id: "headline", x: 0, y: 10, width: 600, height: 80, rotation: 180 },
      { id: "asset_main", x: 400, y: 300, width: 200, height: 100 },
    ]);
    expect(json.rationale).toContain("headline");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.response_format).toEqual({ type: "json_object" });
    const costs = db._tables.get("cost_ledger") ?? [];
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ userId: "owner", agentRunId: null, operation: "openai.layout.suggest.gpt-4o-mini", costMicros: 4000 });
    expect(db._tables.get("cards")![0].cardSpecJson).toBe(originalSpec);
  });

  it("POST /api/public/cards/:id/suggest-layout rejects a foreign card for a non-owner approved user", async () => {
    auth.user = { id: "member", email: "member@youware.com" };
    db._seed(teamProfiles, [{ userId: "member", email: "member@youware.com", approvalStatus: "approved", role: "member", createdAt: 1, updatedAt: 1 }]);
    seedCard("foreign_card", {
      creatorUserId: "other",
      cardSpecJson: JSON.stringify({ layers: [{ id: "headline", kind: "text", x: 0, y: 0, width: 100, height: 40 }] }),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const app = new Hono().route("/api/public", cardRoutes);

    const res = await app.request("/api/public/cards/foreign_card/suggest-layout", { method: "POST" });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);
  });

  it("denies pending and rejected users through route middleware", async () => {
    const app = new Hono().route("/api/public", cardRoutes);
    auth.user = { id: "pending", email: "pending@youware.com" };
    db._seed(teamProfiles, [{ userId: "pending", email: "pending@youware.com", approvalStatus: "pending", role: "member", createdAt: 1, updatedAt: 1 }]);
    const pending = await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Nope", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    expect(pending.status).toBe(403);
    expect((await pending.json()).error.code).toBe("pending_approval");

    auth.user = { id: "rejected", email: "rejected@youware.com" };
    db._seed(teamProfiles, [{ userId: "rejected", email: "rejected@youware.com", approvalStatus: "rejected", role: "member", rejectionReason: "no", createdAt: 1, updatedAt: 1 }]);
    const rejected = await app.request("/api/public/cards", { method: "POST", body: JSON.stringify({ title: "Nope", ratioPreset: "ig-post", agentRunId: "run1", ruleVersionAtSave: "rule1" }) });
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).error.code).toBe("rejected");
  });

  it("streams stored agent run events as SSE", async () => {
    db._tables.get("agent_runs")?.push({
      id: "run_stream",
      userId: "owner",
      prompt: "generate asset",
      provider: "openai",
      model: "gpt-4o-mini",
      state: "completed",
      planJson: JSON.stringify({
        streamEvents: [
          { id: "evt1", runId: "run_stream", type: "step_start", stepId: "plan", label: "Plan request", createdAt: 1 },
          { id: "evt2", runId: "run_stream", type: "done", output: { outputRefs: [] }, createdAt: 2 },
        ],
      }),
      outputRefsJson: "[]",
      createdAt: 1,
    });
    const app = new Hono().route("/api/public/agent", agentRunRoutes);
    const res = await app.request("/api/public/agent/runs/run_stream/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: step_start");
    expect(text).toContain("event: done");
    expect(text).toContain("\"type\":\"done\"");
  });
});

function seedCard(id: string, overrides: Record<string, unknown> = {}) {
  db._seed(cards, [
    {
      id,
      cardRootId: id,
      parentCardId: null,
      title: "Ready",
      status: "ready",
      creatorUserId: "owner",
      ratioPreset: "ig-post",
      width: 1080,
      height: 1080,
      paletteId: null,
      primaryAssetId: null,
      cardSpecJson: JSON.stringify({ template: "basic" }),
      slotAssignmentsJson: "{}",
      copyBlockJson: "{}",
      agentRunId: "run1",
      templateVersion: id,
      ruleVersionAtSave: "rule1",
      lockVersion: 0,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    },
  ]);
}
