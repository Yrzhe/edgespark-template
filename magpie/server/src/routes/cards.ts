import { Hono } from "hono";
import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { agentRuns, assets, brandRuleVersions, cardRuleReports, cards, costLedger, palettes } from "@defs";
import { checkCost, type CostQuoteItem } from "../lib/cost";
import { buildPresignedGetPlaceholder } from "../lib/description/autotag";
import { logEvent } from "../lib/events";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord, parseJson } from "../lib/json";
import { composeCard } from "../lib/compose";
import { runToolLoop, type SettledToolCall } from "../lib/agent/loop";
import type { TurnFn } from "../lib/agent/openai";
import { AGENT_TOOL_NAMES } from "../lib/agent/tools";
import { evaluateCardRules } from "../lib/rules/engine";
import { scheduleBackground as scheduleBackgroundTask, withTimeout } from "../lib/background";
import { reconcileRunRow } from "../lib/reconcile";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";

// Global run watchdog (M-102): an agent run can never stay in "running" longer than this. With
// generate_asset now async + the per-tool watchdog the loop finishes in seconds; this is the
// last-resort backstop that flips a hung run to "failed" so the UI never shows a permanent spinner.
const AGENT_RUN_TIMEOUT_MS = 90_000;

const COMPOSE_QUOTE: CostQuoteItem = { provider: "cloudflare", operation: "worker.compose", units: 1, unitMicros: 1_000 };
const RATIO_PRESETS: Record<string, { width: number; height: number }> = {
  "ig-story": { width: 1080, height: 1920 },
  "ig-post": { width: 1080, height: 1080 },
  "wechat-banner": { width: 1200, height: 675 },
  poster: { width: 1080, height: 1350 },
  "x-card": { width: 1200, height: 628 },
};
const ASPECT_RATIO_PRESETS: Record<string, { ratioPreset: string; width: number; height: number }> = {
  "1:1": { ratioPreset: "ig-post", width: 1080, height: 1080 },
  "16:9": { ratioPreset: "wechat-banner", width: 1200, height: 675 },
  "9:16": { ratioPreset: "ig-story", width: 1080, height: 1920 },
  "4:5": { ratioPreset: "poster", width: 1080, height: 1350 },
  "3:4": { ratioPreset: "custom", width: 1080, height: 1440 },
};

export const cardRoutes = new Hono<AppEnv>()
  .use("*", approvedUserOrAgentKey)
  .get("/cards", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const rows = (await db.select().from(cards)).filter((card: any) => !card.deletedAt && (card.status === "ready" || card.creatorUserId === userId));
    return c.json({ cards: rows });
  })
  .get("/rules/active", async (c) => {
    const rows = (await db.select().from(brandRuleVersions)).filter((row: any) => Number(row.active) === 1 && row.status !== "archived");
    const rule = rows.sort((a: any, b: any) => Number(b.version ?? 0) - Number(a.version ?? 0))[0] ?? await ensureBloomeDefaultRule(c);
    return c.json({ rule: publicRule(rule) });
  })
  .get("/cards/:id", async (c) => getCardById(c))
  .post("/cards", async (c) => saveCard(c, false))
  .patch("/cards/:id", async (c) => saveCard(c, true))
  .get("/cards/:id/rule-report", async (c) => c.json({ cardId: c.req.param("id"), reports: await db.select().from(cardRuleReports).where(eq(cardRuleReports.cardId, c.req.param("id"))) }));

async function getCardById(c: any) {
  const principal = c.get("principal");
  const userId = principalUserId(principal);
  if (!userId) return httpError(c, 401, "user_required", "User principal required.");
  const [row] = await db.select().from(cards).where(eq(cards.id, c.req.param("id"))).limit(1);
  if (!row || row.deletedAt || (row.status === "draft" && row.creatorUserId !== userId)) {
    return httpError(c, 404, "not_found", "Card not found.");
  }
  const [ruleReport, parent, root, palette, agentRun] = await Promise.all([
    latestRuleReport(row.id),
    briefCard(row.parentCardId),
    briefCard(row.cardRootId && row.cardRootId !== row.id ? row.cardRootId : null),
    paletteDetail(row.paletteId),
    row.agentRunId ? agentRunDetail(row.agentRunId) : null,
  ]);
  return c.json({
    card: cardDetail(row),
    ruleReport,
    parent,
    root,
    palette,
    agentRun,
  });
}

export async function saveCard(c: any, isUpdate: boolean) {
  try {
    return await saveCardUnsafe(c, isUpdate);
  } catch (error) {
    const principal = c.get("principal");
    const userId = principal ? principalUserId(principal) : null;
    void logEvent("error", "card_save_failed", error instanceof Error ? error.message : String(error), { userId, route: c.req.path });
    throw error;
  }
}

async function saveCardUnsafe(c: any, isUpdate: boolean) {
  const principal = c.get("principal");
  const userId = principalUserId(principal);
  if (!userId) return httpError(c, 401, "user_required", "User principal required.");
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
  if (isUpdate && isPartialCardPatch(body)) return patchCardPartial(c, body, userId, principal);
  if (typeof body.agentRunId !== "string" || typeof body.ruleVersionAtSave !== "string") return httpError(c, 400, "provenance_required", "agentRunId and ruleVersionAtSave are required.");
  const structured = validateCardPayload(body);
  if ("error" in structured) return httpError(c, 400, structured.error, structured.message);
  const parentCardId = typeof body.parentCardId === "string" ? body.parentCardId : null;
  const provenance = await validateProvenance(body.agentRunId, body.ruleVersionAtSave, userId, parentCardId);
  if ("error" in provenance) return httpError(c, provenance.error === "provenance_mismatch" ? 409 : 400, provenance.error, provenance.message);
  const dims = resolveDims(body);
  const ruleVersion = await activeRuleVersion(body.ruleVersionAtSave);
  if (!ruleVersion) return httpError(c, 400, "invalid_rule_version", "ruleVersionAtSave must reference an active rule version.");
  const rules = parseJson(ruleVersion?.rulesJson, undefined) ?? undefined;
  const draftForRules = isRecord(body.draftForRules) ? body.draftForRules : {};
  const report = evaluateCardRules(draftForRules, rules);
  const override = isRecord(body.ownerOverride) ? body.ownerOverride : null;
  if (override && principal.kind !== "owner") return httpError(c, 403, "owner_override_forbidden", "Only owner principals can record ownerOverride.");
  const requestedStatus = String(body.status ?? "draft");
  const finalStatus = report.pass || override ? requestedStatus : "draft";
  const id = isUpdate ? c.req.param("id") : newId("card");
  const now = Date.now();
  const parent = parentCardId ? (await db.select().from(cards).where(eq(cards.id, parentCardId)).limit(1))[0] : null;
  if (parentCardId && (!parent || parent.deletedAt)) return httpError(c, 400, "invalid_parent_card", "parentCardId must reference an active card.");
  if (typeof body.paletteId === "string") {
    const [palette] = await db.select().from(palettes).where(eq(palettes.id, body.paletteId)).limit(1);
    if (!palette || palette.deletedAt) return httpError(c, 400, "invalid_palette", "paletteId must reference an active palette.");
  }
  if (isUpdate) {
    const [existing] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (!existing || existing.deletedAt) return httpError(c, 404, "not_found", "Card not found.");
    if (existing.creatorUserId !== userId && principal.kind !== "owner") return httpError(c, 403, "forbidden", "Only the card creator can update this card.");
    if (body.lockVersion !== undefined && (!Number.isInteger(body.lockVersion) || Number(body.lockVersion) !== Number(existing.lockVersion ?? 0))) return httpError(c, 409, "lock_version_conflict", "Card lockVersion is stale.");
  }
  const rootId = parent?.cardRootId ?? parent?.id ?? id;
  const templateVersion = parentCardId ?? id;
  const quote = await checkCost(db, userId, [COMPOSE_QUOTE]);
  if (!quote.allowed) return httpError(c, 429, "budget_exhausted", "Daily compose budget would be exceeded.", { quote });
  const compose = composeCard({
    cardId: id,
    cardSpec: structured.cardSpec,
    slotAssignments: structured.slotAssignments,
    copyBlock: structured.copyBlock,
    dims,
    draftForRules: draftForRules as never,
  });

  if (isUpdate) {
    const [existing] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    const nextLockVersion = Number(existing?.lockVersion ?? 0) + 1;
    const updateResult = await db.update(cards).set({
      title: String(body.title ?? "Untitled card"),
      status: finalStatus,
      ratioPreset: String(body.ratioPreset ?? "custom"),
      width: dims.width,
      height: dims.height,
      paletteId: typeof body.paletteId === "string" ? body.paletteId : null,
      primaryAssetId: typeof body.primaryAssetId === "string" ? body.primaryAssetId : null,
      cardSpecJson: JSON.stringify(structured.cardSpec),
      slotAssignmentsJson: JSON.stringify(structured.slotAssignments),
      copyBlockJson: JSON.stringify(structured.copyBlock),
      renderManifestJson: JSON.stringify(body.renderManifest ?? compose.renderManifest),
      ruleVersionAtSave: body.ruleVersionAtSave,
      ownerOverrideJson: override ? JSON.stringify(override) : null,
      updatedAt: now,
      lockVersion: nextLockVersion,
    }).where(body.lockVersion === undefined ? eq(cards.id, id) : and(eq(cards.id, id), eq(cards.lockVersion, Number(body.lockVersion))));
    if (await updateMissed(updateResult)) {
      const current = (await db.select().from(cards).where(eq(cards.id, id)).limit(1))[0] ?? null;
      return httpError(c, 409, "lock_version_conflict", "Card lockVersion is stale.", { current });
    }
  } else {
    await db.insert(cards).values({
      id,
      cardRootId: rootId,
      parentCardId,
      title: String(body.title ?? "Untitled card"),
      status: finalStatus,
      creatorUserId: userId,
      ratioPreset: String(body.ratioPreset ?? "custom"),
      width: dims.width,
      height: dims.height,
      paletteId: typeof body.paletteId === "string" ? body.paletteId : null,
      primaryAssetId: typeof body.primaryAssetId === "string" ? body.primaryAssetId : null,
      cardSpecJson: JSON.stringify(structured.cardSpec),
      slotAssignmentsJson: JSON.stringify(structured.slotAssignments),
      copyBlockJson: JSON.stringify(structured.copyBlock),
      renderManifestJson: JSON.stringify(body.renderManifest ?? compose.renderManifest),
      agentRunId: body.agentRunId,
      templateVersion,
      ruleVersionAtSave: body.ruleVersionAtSave,
      ownerOverrideJson: override ? JSON.stringify(override) : null,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.insert(cardRuleReports).values({ id: newId("crr"), cardId: id, ruleVersionId: body.ruleVersionAtSave, reportJson: JSON.stringify(report), pass: report.pass ? 1 : 0, score: report.score, ownerOverrideJson: override ? JSON.stringify(override) : null, createdAt: now });
  await writeCardComposeCostOnce(quote, id, body.agentRunId, now);
  if (!report.pass && requestedStatus === "ready" && !override) return c.json({ error: { code: "rule_report_failed", message: "Card failed rules and was forced to draft." }, cardDraft: { id, status: finalStatus }, report }, 409);
  return c.json({ id, status: finalStatus, report }, isUpdate ? 200 : 201);
}

export const agentRunRoutes = new Hono<AppEnv>()
  .use("*", approvedUserOrAgentKey)
  .post("/runs", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body) || typeof body.prompt !== "string") return httpError(c, 400, "invalid_request", "prompt is required.");
    // Budget pre-gate only: the run streams a plan/model response but does NOT itself
    // compose. The single chargeable compose is recorded once at card-save
    // (writeCardComposeCostOnce). Charging worker.compose here too double-counted the same
    // logical compose (todayUsdSpent reported 2-3x actual). costMicros stays as the run's
    // quoted estimate for the UI; the ledger is the source of truth for spend.
    const quote = await checkCost(db, userId, [COMPOSE_QUOTE]);
    if (!quote.allowed) return httpError(c, 429, "budget_exhausted", "Daily chargeable budget would be exceeded.", { quote });
    // Optional working card for the run's tool calls (get/add layers, brand rules).
    const cardId = typeof body.cardId === "string" ? body.cardId : null;
    const isOwner = principal.kind === "owner" || (principal.kind === "user" && principal.role === "owner");
    if (cardId) {
      const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
      if (!card || card.deletedAt) return httpError(c, 400, "invalid_card", "cardId must reference an active card.");
      if (card.creatorUserId !== userId && !isOwner) return httpError(c, 403, "forbidden", "You can only run an agent against your own card.");
    }
    const now = Date.now();
    const id = newId("run");
    const plannedParentCardId = plannedParentFromBody(body);
    const plan = isRecord(body.plan) ? body.plan : {};
    await db.insert(agentRuns).values({ id, userId, sessionId: typeof body.sessionId === "string" ? body.sessionId : null, cardId, plannedParentCardId, provider: "openai", model: "gpt-4.1-mini", state: "running", prompt: body.prompt, planJson: JSON.stringify({ ...plan, streamEvents: [] }), toolsJson: JSON.stringify(AGENT_TOOL_NAMES), outputRefsJson: "[]", costMicros: quote.totalMicros, createdAt: now, startedAt: now });
    scheduleBackground(streamAgentRunTask({ runId: id, userId, prompt: body.prompt, cardId, isOwner }));
    return c.json({ id, quote, allowedTools: AGENT_TOOL_NAMES }, 202);
  })
  .get("/runs/:id/events", async (c) => streamAgentRunEvents(c))
  .get("/runs/:id", async (c) => {
    const rows = await db.select().from(agentRuns).where(eq(agentRuns.id, c.req.param("id")));
    if (!rows[0]) return httpError(c, 404, "not_found", "Agent run not found.");
    const run = await reconcileRunRow(rows[0]); // M-102 layer 2: stale running → failed
    return c.json({ run: publicAgentRun(run) });
  });

type AgentRunStreamEvent = {
  id: string;
  runId: string;
  type: "step_start" | "step_end" | "output" | "tool_call_start" | "tool_call_result" | "done" | "error";
  stepId?: string;
  label?: string;
  delta?: string;
  tool?: string;
  args?: Record<string, unknown>;
  resultPreview?: Record<string, unknown>;
  success?: boolean;
  output?: unknown;
  createdAt: number;
};

const AGENT_STEPS = [
  { id: "plan", label: "Plan request" },
  { id: "model", label: "Generate response" },
  { id: "finalize", label: "Prepare outputs" },
] as const;

function scheduleBackground(task: Promise<unknown>): void {
  scheduleBackgroundTask(task);
}

async function streamAgentRunEvents(c: any): Promise<Response> {
  const runId = c.req.param("id");
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) return httpError(c, 404, "not_found", "Agent run not found.");
  const encoder = new TextEncoder();
  let cancelled = false;
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      const startedAt = Date.now();
      while (!cancelled && Date.now() - startedAt < 120_000) {
        const [latest] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
        if (!latest) {
          controller.enqueue(encoder.encode(sseEvent({ id: newId("ase"), runId, type: "error", output: { code: "not_found" }, createdAt: Date.now() })));
          break;
        }
        const events = streamEventsFromRun(latest);
        for (const event of events.slice(sent)) controller.enqueue(encoder.encode(sseEvent(event)));
        sent = events.length;
        if (events.some((event) => event.type === "done" || event.type === "error") || latest.state === "completed" || latest.state === "failed") break;
        await sleep(350);
      }
      try {
        controller.close();
      } catch {
        // Stream may already be closed by the client.
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export interface AgentRunTaskInput {
  runId: string;
  userId: string;
  prompt: string;
  cardId?: string | null;
  isOwner?: boolean;
  // Injectable model turn for tests; production uses the real OpenAI streaming turn.
  turn?: TurnFn;
}

async function streamAgentRunTask(input: AgentRunTaskInput): Promise<void> {
  try {
    await withTimeout(runAgentRun(input), AGENT_RUN_TIMEOUT_MS, "agent_run");
  } catch (error) {
    await failAgentRun(input, error);
  }
}

export async function runAgentRun(input: AgentRunTaskInput): Promise<void> {
  await appendRunEvent(input.runId, "step_start", { stepId: "plan", label: AGENT_STEPS[0].label });
  await appendRunEvent(input.runId, "step_end", { stepId: "plan", label: AGENT_STEPS[0].label, output: { tools: AGENT_TOOL_NAMES } });
  await appendRunEvent(input.runId, "step_start", { stepId: "model", label: AGENT_STEPS[1].label });

  // M-102 R11: eager completion. A generate run's inline render (~20s) plus the trailing model
  // summary turn can run past the Worker waitUntil window, so the post-loop state="completed"
  // write would never land and the run orphaned in "running" (then reconcile mislabeled it
  // failed even though the image succeeded). We now persist state="completed" + the produced
  // outputRefs the moment the tools settle — before the summary turn — so completion lands
  // inside the window the asset write already proved survivable. The summary turn then only
  // enriches; if the window recycles it never runs, but the run is already correctly completed.
  let settledTools: SettledToolCall[] = [];
  let completedEarly = false;
  const markCompletedFromTools = async (settled: SettledToolCall[]) => {
    settledTools = settled;
    if (completedEarly || !settled.some((s) => s.success && PRODUCING_TOOLS.has(s.tool))) return;
    completedEarly = true;
    const outputRefs = buildRunOutputRefs(settled, "");
    await db.update(agentRuns).set({ state: "completed", finishedAt: Date.now(), outputRefsJson: JSON.stringify(outputRefs) }).where(eq(agentRuns.id, input.runId));
  };

  const loop = await runToolLoop({
    prompt: input.prompt,
    cardId: input.cardId ?? null,
    ctx: { userId: input.userId, isOwner: input.isOwner === true, runId: input.runId },
    turn: input.turn,
    emit: async (event) => {
      if (event.type === "output") return appendRunEvent(input.runId, "output", { stepId: "model", delta: event.delta });
      if (event.type === "tool_call_start") return appendRunEvent(input.runId, "tool_call_start", { tool: event.tool, args: event.args });
      return appendRunEvent(input.runId, "tool_call_result", { tool: event.tool, resultPreview: event.resultPreview, success: event.success });
    },
    onToolPhaseSettled: markCompletedFromTools,
  });

  await appendRunEvent(input.runId, "step_end", { stepId: "model", label: AGENT_STEPS[1].label, output: { chars: loop.text.length, toolCallsMade: loop.toolCallsMade, hitMaxIterations: loop.hitMaxIterations } });
  await appendRunEvent(input.runId, "step_start", { stepId: "finalize", label: AGENT_STEPS[2].label });
  // Final, enriched output refs: the model's summary text + every produced asset/layer.
  const outputRefs = buildRunOutputRefs(settledTools, loop.text);
  await db.update(agentRuns).set({ outputRefsJson: JSON.stringify(outputRefs) }).where(eq(agentRuns.id, input.runId));
  await appendRunEvent(input.runId, "step_end", { stepId: "finalize", label: AGENT_STEPS[2].label, output: { outputRefs: outputRefs.length } });
  await appendRunEvent(input.runId, "done", { output: { text: loop.text, outputRefs, toolCallsMade: loop.toolCallsMade } });
  // Idempotent: keeps completed (or sets it for tool-less / search-only runs that never checkpoint).
  await db.update(agentRuns).set({ state: "completed", finishedAt: Date.now() }).where(eq(agentRuns.id, input.runId));
}

// Tools whose success means the run produced real, user-visible output worth completing on.
const PRODUCING_TOOLS = new Set(["generate_asset", "add_layer_to_card"]);

// Build run output refs: the assistant summary (if any) plus a ref per produced asset/layer.
function buildRunOutputRefs(settled: SettledToolCall[], text: string): Array<Record<string, unknown>> {
  const refs: Array<Record<string, unknown>> = [];
  if (text) refs.push({ type: "assistantText", title: "Agent response", text });
  for (const s of settled) {
    if (!s.success) continue;
    const preview = s.resultPreview ?? {};
    if (s.tool === "generate_asset" && typeof preview.assetId === "string") refs.push({ type: "asset", title: "Generated asset", assetId: preview.assetId });
    if (s.tool === "add_layer_to_card" && typeof preview.layerId === "string") refs.push({ type: "layer", title: "Added layer", layerId: preview.layerId, cardId: preview.cardId });
  }
  if (refs.length === 0) refs.push({ type: "assistantText", title: "Agent response", text });
  return refs;
}

async function failAgentRun(input: { runId: string; userId: string }, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await appendRunEvent(input.runId, "error", { output: { message } });
  } catch {
    // If event persistence itself failed, still update the run row and admin event.
  }
  await db.update(agentRuns).set({ state: "failed", finishedAt: Date.now(), errorCode: "agent_run_failed", errorMessage: message }).where(eq(agentRuns.id, input.runId));
  await logEvent("error", "error_unhandled_agent_run", message, { userId: input.userId, route: "/api/public/agent/runs", meta: { runId: input.runId } });
}

async function appendRunEvent(runId: string, type: AgentRunStreamEvent["type"], patch: Partial<AgentRunStreamEvent> = {}): Promise<void> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) return;
  const plan = parseJson<Record<string, unknown>>(run.planJson, {});
  const current = Array.isArray(plan.streamEvents) ? plan.streamEvents : [];
  const event: AgentRunStreamEvent = { id: newId("ase"), runId, type, createdAt: Date.now(), ...patch };
  await db.update(agentRuns).set({ planJson: JSON.stringify({ ...plan, streamEvents: [...current, event] }) }).where(eq(agentRuns.id, runId));
}

function streamEventsFromRun(run: any): AgentRunStreamEvent[] {
  const plan = parseJson<Record<string, unknown>>(run.planJson, {});
  return Array.isArray(plan.streamEvents) ? plan.streamEvents as AgentRunStreamEvent[] : [];
}

function sseEvent(event: AgentRunStreamEvent): string {
  return `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function patchCardPartial(c: any, body: Record<string, unknown>, userId: string, principal: AppEnv["Variables"]["principal"]) {
  const id = c.req.param("id");
  const [existing] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  if (!existing || existing.deletedAt) return httpError(c, 404, "not_found", "Card not found.");
  if (existing.creatorUserId !== userId && principal.kind !== "owner") return httpError(c, 403, "forbidden", "Only the card creator can update this card.");
  if (body.lockVersion !== undefined && (!Number.isInteger(body.lockVersion) || Number(body.lockVersion) !== Number(existing.lockVersion ?? 0))) {
    return httpError(c, 409, "lock_version_conflict", "Card lockVersion is stale.", { current: existing });
  }
  const update: Record<string, unknown> = { updatedAt: Date.now(), lockVersion: Number(existing.lockVersion ?? 0) + 1 };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 200) return httpError(c, 400, "invalid_title", "title must be 1-200 characters.");
    update.title = title;
  }
  const aspect = typeof body.aspect_ratio === "string" ? body.aspect_ratio : typeof body.aspectRatio === "string" ? body.aspectRatio : null;
  if (aspect !== null) {
    const preset = ASPECT_RATIO_PRESETS[aspect];
    if (!preset) return httpError(c, 400, "invalid_aspect_ratio", "aspect_ratio must be one of 1:1, 16:9, 9:16, 4:5, 3:4.");
    update.ratioPreset = preset.ratioPreset;
    update.width = preset.width;
    update.height = preset.height;
  }
  const result = await db.update(cards).set(update).where(body.lockVersion === undefined ? eq(cards.id, id) : and(eq(cards.id, id), eq(cards.lockVersion, Number(body.lockVersion))));
  if (body.lockVersion !== undefined && await updateMissed(result)) {
    const current = (await db.select().from(cards).where(eq(cards.id, id)).limit(1))[0] ?? null;
    return httpError(c, 409, "lock_version_conflict", "Card lockVersion is stale.", { current });
  }
  const [latest] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  return c.json({ id, card: latest ? cardDetail(latest) : null });
}

function isPartialCardPatch(body: Record<string, unknown>): boolean {
  const patchKeys = new Set(["title", "aspect_ratio", "aspectRatio", "lockVersion"]);
  const keys = Object.keys(body);
  return keys.length > 0 && keys.every((key) => patchKeys.has(key));
}

async function writeCardComposeCostOnce(quote: Awaited<ReturnType<typeof checkCost>>, cardId: string, agentRunId: string | null | undefined, now: number): Promise<void> {
  if (!quote.allowed) throw new Error("budget_exhausted");
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const existing = (await db.select().from(costLedger))
    .some((row: any) => row.userId === quote.userId && row.operation === COMPOSE_QUOTE.operation && Number(row.occurredAt ?? 0) >= dayAgo && parseJson<Record<string, unknown>>(row.metaJson, {}).cardId === cardId);
  if (existing) return;
  for (const item of quote.items) {
    await db.insert(costLedger).values({
      id: newId("cost"),
      userId: quote.userId,
      agentRunId,
      provider: item.provider,
      operation: item.operation,
      units: item.units,
      unitMicros: item.unitMicros,
      costMicros: item.units * item.unitMicros,
      occurredAt: now,
      metaJson: JSON.stringify({ cardId, dedupeWindowHours: 24 }),
    });
  }
}

function resolveDims(body: Record<string, unknown>) {
  const preset = typeof body.ratioPreset === "string" ? RATIO_PRESETS[body.ratioPreset] : null;
  if (preset) return preset;
  const width = Number(body.width);
  const height = Number(body.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("invalid_dims");
  return { width, height };
}

async function activeRuleVersion(id: string) {
  const [rule] = await db.select().from(brandRuleVersions).where(eq(brandRuleVersions.id, id)).limit(1);
  if (rule && Number(rule.active) !== 1) return null;
  return rule;
}

function principalUserId(principal: AppEnv["Variables"]["principal"]): string | null {
  return principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
}

function cardDetail(row: any) {
  return {
    id: row.id,
    name: row.title,
    status: row.status,
    ratioPreset: row.ratioPreset,
    width: row.width,
    height: row.height,
    parentCardId: row.parentCardId ?? null,
    cardRootId: row.cardRootId ?? null,
    paletteId: row.paletteId ?? null,
    cardSpec: parseJson(row.cardSpecJson, {}),
    slotAssignments: parseJson(row.slotAssignmentsJson, {}),
    copyBlock: parseJson(row.copyBlockJson, {}),
    ownerUserId: row.creatorUserId,
    lockVersion: row.lockVersion ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function latestRuleReport(cardId: string) {
  const reports = (await db.select().from(cardRuleReports).where(eq(cardRuleReports.cardId, cardId))).slice().sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  const report = reports[0];
  if (!report) return null;
  const parsed = parseJson<Record<string, unknown>>(report.reportJson, {});
  const findings = Array.isArray(parsed.findings) ? parsed.findings : Array.isArray(parsed.rules) ? parsed.rules : [];
  return {
    id: report.id,
    ruleVersionId: report.ruleVersionId,
    passed: Number(report.pass) === 1,
    findings,
  };
}

function publicRule(row: any) {
  return {
    id: row.id,
    family: row.family,
    version: row.version,
    status: row.status,
    active: Number(row.active) === 1,
    rules: parseJson(row.rulesJson, []),
    canonicalPalette: parseJson(row.canonicalPaletteJson, []),
    lockVersion: row.lockVersion ?? 0,
  };
}

const BLOOME_CANONICAL_RULES = [
  { id: "palette", kind: "palette", threshold: { deltaE: 6 }, description: "Colors must match Bloome canonical within Delta-E 6." },
  { id: "clearspace", kind: "clearspace", threshold: { pct: 0.08 }, description: "Logo clearspace at least 8% of canvas shorter side." },
  { id: "letterform", kind: "letterform", threshold: { transformDeviationPct: 4 }, description: "Wordmark transform deviation under 4%." },
];

const BLOOME_CANONICAL_PALETTE = [
  { role: "primary", hex: "#2556B6" },
  { role: "accent", hex: "#F36440" },
  { role: "foreground", hex: "#0C0A0F" },
  { role: "background", hex: "#F7F5F1" },
  { role: "destructive", hex: "#BC4E32" },
  { role: "success", hex: "#48BB78" },
];

async function ensureBloomeDefaultRule(c: any) {
  const now = Date.now();
  const principal = c.get("principal");
  const seederId = principal?.userId ?? "system";
  const row = {
    id: newId("rule"),
    family: "bloome",
    version: 1,
    status: "published",
    active: 1,
    rulesJson: JSON.stringify(BLOOME_CANONICAL_RULES),
    canonicalPaletteJson: JSON.stringify(BLOOME_CANONICAL_PALETTE),
    ownerNotes: "Auto-seeded Bloome canonical default. Owner can edit or supersede.",
    createdBy: seederId,
    lockVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(brandRuleVersions).values(row);
    return row;
  } catch {
    // Race: concurrent first call already seeded. Re-select the winner.
    const rows = (await db.select().from(brandRuleVersions)).filter((r: any) => r.family === "bloome" && Number(r.active) === 1 && r.status !== "archived");
    const winner = rows.sort((a: any, b: any) => Number(b.version ?? 0) - Number(a.version ?? 0))[0];
    if (winner) return winner;
    throw new Error("rule_seed_race_unresolved");
  }
}

function publicAgentRun(row: any) {
  return {
    id: row.id,
    sessionId: row.sessionId ?? null,
    state: row.state,
    status: row.state,
    prompt: row.prompt,
    plan: parseJson(row.planJson, {}),
    tools: parseJson(row.toolsJson, []),
    outputRefs: parseJson(row.outputRefsJson, []),
    costMicros: row.costMicros ?? 0,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
  };
}

async function briefCard(cardId?: string | null) {
  if (!cardId) return null;
  const [row] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!row || row.deletedAt) return null;
  return {
    id: row.id,
    name: row.title,
    thumbnailUrl: await thumbnailUrl(row.primaryAssetId),
  };
}

async function thumbnailUrl(assetId?: string | null) {
  if (!assetId) return null;
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset || asset.deletedAt) return null;
  return buildPresignedGetPlaceholder(asset.s3Uri);
}

async function paletteDetail(paletteId?: string | null) {
  if (!paletteId) return null;
  const [row] = await db.select().from(palettes).where(eq(palettes.id, paletteId)).limit(1);
  if (!row || row.deletedAt) return null;
  return {
    id: row.id,
    name: row.name,
    colors: paletteColorsObject(row.colorsJson),
  };
}

function paletteColorsObject(colorsJson: string): Record<string, string> {
  const parsed = parseJson<unknown>(colorsJson, []);
  if (!Array.isArray(parsed)) return isRecord(parsed) ? parsed as Record<string, string> : {};
  const colors: Record<string, string> = {};
  for (const color of parsed) {
    if (!isRecord(color) || typeof color.role !== "string" || typeof color.hex !== "string") continue;
    colors[camelKey(color.role)] = color.hex;
  }
  if (!colors.foreground && typeof colors.text === "string") colors.foreground = colors.text;
  if (!colors.background && typeof colors.contentBg === "string") colors.background = colors.contentBg;
  if (!colors.background && typeof colors.secondaryBg === "string") colors.background = colors.secondaryBg;
  return colors;
}

async function agentRunDetail(agentRunId: string) {
  const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, agentRunId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.state,
    createdAt: row.createdAt,
  };
}

function camelKey(key: string): string {
  return key.replace(/[-_\s]+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

function validateCardPayload(body: Record<string, unknown>): { cardSpec: Record<string, unknown>; slotAssignments: Record<string, unknown>; copyBlock: Record<string, unknown> } | { error: string; message: string } {
  if (body.cardSpec !== undefined && !isRecord(body.cardSpec)) return { error: "invalid_card_spec", message: "cardSpec must be an object." };
  if (body.slotAssignments !== undefined && !isRecord(body.slotAssignments)) return { error: "invalid_slot_assignments", message: "slotAssignments must be an object." };
  if (body.copyBlock !== undefined && !isRecord(body.copyBlock)) return { error: "invalid_copy_block", message: "copyBlock must be an object." };
  return { cardSpec: (body.cardSpec ?? {}) as Record<string, unknown>, slotAssignments: (body.slotAssignments ?? {}) as Record<string, unknown>, copyBlock: (body.copyBlock ?? {}) as Record<string, unknown> };
}

async function validateProvenance(agentRunId: string, ruleVersionAtSave: string, userId: string, parentCardId: string | null): Promise<{ ok: true } | { error: string; message: string }> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, agentRunId)).limit(1);
  if (!run) return { error: "invalid_agent_run", message: "agentRunId must reference an existing run." };
  if (run.userId !== userId) return { error: "agent_run_owner_mismatch", message: "agentRunId does not belong to the caller." };
  const plan = parseJson<Record<string, unknown>>(run.planJson, {});
  const plannedRule = typeof plan.ruleVersionAtSave === "string" ? plan.ruleVersionAtSave : typeof plan.ruleVersionId === "string" ? plan.ruleVersionId : null;
  if (!plannedRule) return { error: "rule_version_missing_from_run", message: "agent run plan must record the rule version used." };
  if (plannedRule && plannedRule !== ruleVersionAtSave) return { error: "rule_version_mismatch", message: "ruleVersionAtSave does not match the agent run plan." };
  const plannedParent = typeof run.plannedParentCardId === "string" ? run.plannedParentCardId : plannedParentFromPlan(plan);
  if ((plannedParent ?? null) !== parentCardId) return { error: "provenance_mismatch", message: "parentCardId does not match the agent run planned lineage." };
  return { ok: true };
}

function plannedParentFromBody(body: Record<string, unknown>): string | null {
  if (typeof body.plannedParentCardId === "string") return body.plannedParentCardId;
  if (typeof body.parentCardId === "string") return body.parentCardId;
  if (isRecord(body.plan)) return plannedParentFromPlan(body.plan);
  return null;
}

function plannedParentFromPlan(plan: Record<string, unknown>): string | null {
  if (typeof plan.plannedParentCardId === "string") return plan.plannedParentCardId;
  if (typeof plan.parentCardId === "string") return plan.parentCardId;
  if (typeof plan.planned_parent_card_id === "string") return plan.planned_parent_card_id;
  return null;
}

async function updateMissed(result: unknown): Promise<boolean> {
  const affected = affectedRows(result);
  if (affected !== null) return affected === 0;
  throw new Error("driver_lacks_row_count");
}

function affectedRows(result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, any>;
  return Number.isInteger(r.rowsAffected) ? r.rowsAffected : Number.isInteger(r.changes) ? r.changes : Number.isInteger(r.meta?.changes) ? r.meta.changes : null;
}
