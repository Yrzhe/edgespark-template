import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuns, assets, brandRuleVersions, cards } from "@defs";
import { ctx, db, secret, storage, vars } from "edgespark";
import { AGENT_TOOLS, AGENT_TOOL_NAMES, executeTool, type ToolContext } from "../src/lib/agent/tools";
import { MAX_ITERATIONS, runToolLoop, type AgentLoopEvent } from "../src/lib/agent/loop";
import { openAiTurn, type ChatMessage, type ModelTurn } from "../src/lib/agent/openai";
import { runAgentRun } from "../src/routes/cards";
import { baselineRules } from "../src/lib/rules/engine";

const OWNER: ToolContext = { userId: "owner", isOwner: true, runId: "run_test" };

function seedCard(overrides: Record<string, unknown> = {}) {
  db._seed(cards, [
    {
      id: "card1",
      cardRootId: "card1",
      title: "Test card",
      status: "draft",
      creatorUserId: "owner",
      ratioPreset: "ig-post",
      width: 1080,
      height: 1080,
      cardSpecJson: JSON.stringify({ title: "Test", layers: [{ id: "l_bg", kind: "bg", name: "Background" }] }),
      agentRunId: "run1",
      templateVersion: "card1",
      ruleVersionAtSave: "rule1",
      lockVersion: 0,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    },
  ]);
}

describe("agent tool executors", () => {
  beforeEach(() => { db._reset(); (ctx as any)._background = []; (storage as any)._resetPuts(); });
  afterEach(() => {
    vi.restoreAllMocks();
    secret.values.delete("OPENAI_API_KEY");
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("registers batch_generate and suggest_layout on the agent tool surface", () => {
    expect(AGENT_TOOL_NAMES).toHaveLength(8);
    expect(AGENT_TOOL_NAMES).toContain("batch_generate");
    expect(AGENT_TOOL_NAMES).toContain("suggest_layout");
    const single = AGENT_TOOLS.find((t) => t.function.name === "generate_asset");
    expect((single?.function.parameters.properties as any).referenceAssetIds).toMatchObject({ type: "array", maxItems: 3 });
    const tool = AGENT_TOOLS.find((t) => t.function.name === "batch_generate");
    expect(tool?.function.parameters).toMatchObject({
      type: "object",
      properties: {
        prompt: { type: "string" },
        count: { type: "integer", maximum: 6 },
      },
      required: ["prompt", "count"],
    });
    expect((tool?.function.parameters.properties as any).referenceAssetIds).toMatchObject({ type: "array", maxItems: 3 });
    const layout = AGENT_TOOLS.find((t) => t.function.name === "suggest_layout");
    expect(layout?.function.parameters).toMatchObject({ type: "object", required: ["cardId"] });
  });

  it("search_asset really queries the DB and ranks by term matches", async () => {
    db._seed(assets, [
      { id: "asset_cat", name: "Cat photo", description: "a fluffy orange cat sitting", s3Uri: "r2://m/cat.png", tagsJson: JSON.stringify(["animal"]), createdAt: 1 },
      { id: "asset_dog", name: "Dog photo", description: "a dog running", s3Uri: "r2://m/dog.png", tagsJson: "[]", createdAt: 1 },
      { id: "asset_del", name: "Cat deleted", description: "cat", s3Uri: "r2://m/x.png", tagsJson: "[]", deletedAt: 2, createdAt: 1 },
    ]);
    const res = await executeTool("search_asset", { query: "cat" }, OWNER);
    expect(res.success).toBe(true);
    const found = (res.result as any).assets;
    expect(found.map((a: any) => a.assetId)).toEqual(["asset_cat"]); // dog excluded, deleted excluded
    expect(found[0].thumbnail).not.toContain("r2://"); // presigned, never raw R2
    expect(res.resultPreview).toMatchObject({ tool: "search_asset", count: 1, success: true });
  });

  it("describe_asset returns metadata for an existing asset and 404s otherwise", async () => {
    db._seed(assets, [{ id: "asset_1", name: "Sprout", description: "a green sprout cutout", transparent: 1, s3Uri: "r2://m/s.png", tagsJson: JSON.stringify(["cutout"]), createdAt: 1 }]);
    const ok = await executeTool("describe_asset", { assetId: "asset_1" }, OWNER);
    expect(ok.success).toBe(true);
    expect(ok.result).toMatchObject({ assetId: "asset_1", description: "a green sprout cutout", transparent: true });
    const missing = await executeTool("describe_asset", { assetId: "nope" }, OWNER);
    expect(missing.success).toBe(false);
    expect(missing.error).toBe("asset_not_found");
  });

  it("get_card_layers returns the card's layers", async () => {
    seedCard();
    const res = await executeTool("get_card_layers", { cardId: "card1" }, OWNER);
    expect(res.success).toBe(true);
    expect((res.result as any).layers).toHaveLength(1);
    expect((res.result as any).layers[0].kind).toBe("bg");
  });

  it("get_brand_rules resolves the card's rule version palette + rules", async () => {
    seedCard();
    db._seed(brandRuleVersions, [
      { id: "rule1", family: "bloome", version: 3, rulesJson: JSON.stringify(baselineRules()), canonicalPaletteJson: JSON.stringify([{ role: "primary", hex: "#2556B6" }]), active: 1 },
    ]);
    const res = await executeTool("get_brand_rules", { cardId: "card1" }, OWNER);
    expect(res.success).toBe(true);
    expect((res.result as any).colors).toEqual([{ role: "primary", hex: "#2556B6" }]);
    expect((res.result as any).rules.length).toBeGreaterThan(0);
  });

  it("suggest_layout returns geometry-only proposals and ties cost to the agent run", async () => {
    secret.values.set("OPENAI_API_KEY", "sk-test");
    seedCard({
      width: 500,
      height: 300,
      cardSpecJson: JSON.stringify({
        layers: [
          { id: "headline", kind: "text", textValue: "Hello", x: 20, y: 20, width: 120, height: 40 },
          { id: "asset", kind: "asset", assetId: "asset_leaf", x: 200, y: 80, width: 120, height: 120 },
        ],
      }),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ layers: [{ id: "headline", x: 12, y: 16, width: 220, height: 48 }], rationale: "Headline first." }) } }],
    }), { status: 200 }));

    const res = await executeTool("suggest_layout", { cardId: "card1" }, OWNER);

    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ layers: [{ id: "headline", x: 12, y: 16, width: 220, height: 48 }], rationale: "Headline first." });
    expect(res.resultPreview).toMatchObject({ tool: "suggest_layout", cardId: "card1", layerCount: 1, success: true });
    const costs = db._tables.get("cost_ledger") ?? [];
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ operation: "openai.layout.suggest.gpt-4o-mini", agentRunId: OWNER.runId, userId: OWNER.userId });
  });

  it("add_layer_to_card appends a layer and bumps lockVersion", async () => {
    seedCard();
    const res = await executeTool(
      "add_layer_to_card",
      { cardId: "card1", layer: { type: "text", text: "Hello", x: 10, y: 20, width: 200, height: 80, decoration: "wavy" } },
      OWNER,
    );
    expect(res.success).toBe(true);
    const card = db._tables.get("cards")![0];
    const spec = JSON.parse(card.cardSpecJson);
    expect(spec.layers).toHaveLength(2);
    const added = spec.layers[1];
    expect(added).toMatchObject({ kind: "text", textValue: "Hello", x: 10, y: 20, width: 200, height: 80, decoration: "wavy", opacity: 1 });
    expect(card.lockVersion).toBe(1);
  });

  it("add_layer_to_card forbids a non-creator non-owner", async () => {
    seedCard();
    const res = await executeTool(
      "add_layer_to_card",
      { cardId: "card1", layer: { type: "text", text: "x", x: 0, y: 0, width: 10, height: 10 } },
      { userId: "intruder", isOwner: false, runId: "r" },
    );
    expect(res.success).toBe(false);
    expect(res.error).toBe("forbidden");
  });

  it("add_layer_to_card rejects an asset layer without assetId", async () => {
    seedCard();
    const res = await executeTool("add_layer_to_card", { cardId: "card1", layer: { type: "asset", x: 0, y: 0, width: 10, height: 10 } }, OWNER);
    expect(res.success).toBe(false);
    expect(res.error).toContain("assetId required");
  });

  it("generate_asset renders INLINE: asset is ready (bytes in R2) before the tool returns (M-102 R10)", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5"); // mock default 0.02 < imagegen 0.08 unit
    delete process.env.OPENAI_API_KEY; // force dev placeholder, never a real OpenAI call
    (storage as any)._resetPuts();
    const res = await executeTool("generate_asset", { prompt: "a coral cat cutout", transparent: true }, OWNER);
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ status: "ready", mode: "transparent" }); // ready before return — NO "generating" left
    const assetId = (res.result as any).assetId;
    // No background drain needed: the row is ready and bytes are persisted synchronously.
    const asset = db._tables.get("assets")!.find((a: any) => a.id === assetId);
    expect(asset).toMatchObject({ status: "ready", source: "agent-gen", transparent: 1, ownerUserId: "owner" });
    expect(asset.byteSize).toBeGreaterThan(0);
    expect(asset.s3Uri).toBe(`s3://magpie-media/assets/agent-gen/${assetId}.png`);
    expect((storage as any)._puts.length).toBe(1); // bytes actually put to R2 inside the tool call
    expect((storage as any)._puts[0].path).toBe(`assets/agent-gen/${assetId}.png`);
    const ledger = db._tables.get("cost_ledger") ?? [];
    expect(ledger.filter((r: any) => r.operation === "openai.imagegen.gpt-image-2").length).toBe(1); // charged exactly once
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("generate_asset with referenceAssetIds persists bytes, cost, provenance, and auto-description", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    (storage as any)._seedObject("magpie-media", "assets/uploads/ref.png", 6, new Date(0), "image/png");
    db._seed(assets, [{
      id: "asset_ref",
      ownerUserId: "owner",
      status: "ready",
      source: "upload",
      name: "Reference",
      s3Uri: "s3://magpie-media/assets/uploads/ref.png",
      contentType: "image/png",
      byteSize: 6,
      tagsJson: "[]",
      createdAt: 1,
      updatedAt: 1,
    }]);

    const res = await executeTool("generate_asset", { prompt: "same-style coral leaf", transparent: true, referenceAssetIds: ["asset_ref"] }, OWNER);
    expect(res.success).toBe(true);
    const assetId = (res.result as any).assetId;
    const asset = db._tables.get("assets")!.find((a: any) => a.id === assetId);
    expect(asset).toMatchObject({ status: "ready", ownerUserId: "owner", source: "agent-gen", agentRunId: OWNER.runId });
    expect(asset.byteSize).toBeGreaterThan(0);
    expect(JSON.parse(asset.provenanceJson).referenceAssetIds).toEqual(["asset_ref"]);
    expect((storage as any)._puts).toHaveLength(1);
    const imageCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => String(r.operation).startsWith("openai.imagegen."));
    expect(imageCosts).toHaveLength(1);

    await (ctx as any)._drainBackground();
    const described = db._tables.get("assets")!.find((a: any) => a.id === assetId);
    expect(described).toMatchObject({ descriptionSource: "llm-auto" });
    expect(typeof described.description).toBe("string");
    const visionCosts = (db._tables.get("cost_ledger") ?? []).filter((r: any) => r.operation === "openai.vision.describe.gpt-4o-mini");
    expect(visionCosts).toHaveLength(1);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("generate_asset rejects over-budget BEFORE creating a pending row (pre-call guard)", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.0001"); // below the imagegen unit cost
    (storage as any)._resetPuts();
    const res = await executeTool("generate_asset", { prompt: "too expensive", transparent: true }, OWNER);
    expect(res.success).toBe(false);
    expect(res.error).toBe("budget_exhausted");
    expect(db._tables.get("assets")?.length ?? 0).toBe(0); // no pending row leaked
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("batch_generate reserves pending assets and returns immediately without bytes or cost", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    const res = await executeTool("batch_generate", { prompt: "three coral sprout cutouts", count: 3, transparent: true }, OWNER);
    expect(res.success).toBe(true);
    expect(res.resultPreview).toMatchObject({ tool: "batch_generate", requested: 3, status: "generating", success: true });
    expect((res.resultPreview.assetIds as string[])).toHaveLength(3);

    const assetIds = res.resultPreview.assetIds as string[];
    const rows = db._tables.get("assets") ?? [];
    expect(rows.map((a: any) => a.id)).toEqual(assetIds);
    expect(rows.every((a: any) => a.status === "generating" && a.source === "agent-gen" && a.transparent === 1 && a.byteSize === 0)).toBe(true);
    expect(rows.every((a: any) => a.agentRunId === OWNER.runId)).toBe(true);
    expect(rows.every((a: any) => String(a.s3Uri).startsWith("s3://magpie-media/assets/agent-gen/"))).toBe(true);
    for (const row of rows) {
      const provenance = JSON.parse(row.provenanceJson);
      expect(provenance).toMatchObject({ batch: true, lazyMaterialize: true, model: "gpt-image-1", agentRunId: OWNER.runId });
      expect(provenance.prompt).toContain("Active palette");
    }
    expect((storage as any)._puts.length).toBe(0);
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("batch_generate stores validated referenceAssetIds for lazy materialization", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    (storage as any)._seedObject("magpie-media", "assets/uploads/ref.png", 6, new Date(0), "image/png");
    db._seed(assets, [{
      id: "asset_ref",
      ownerUserId: "owner",
      status: "ready",
      source: "upload",
      name: "Reference",
      s3Uri: "s3://magpie-media/assets/uploads/ref.png",
      contentType: "image/png",
      byteSize: 6,
      tagsJson: "[]",
      createdAt: 1,
      updatedAt: 1,
    }]);
    const res = await executeTool("batch_generate", { prompt: "two same-style badges", count: 2, transparent: false, referenceAssetIds: ["asset_ref"] }, OWNER);
    expect(res.success).toBe(true);
    const rows = (db._tables.get("assets") ?? []).filter((a: any) => a.source === "agent-gen");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const provenance = JSON.parse(row.provenanceJson);
      expect(provenance).toMatchObject({ model: "gpt-image-1", referenceAssetIds: ["asset_ref"], lazyMaterialize: true });
    }
    expect((storage as any)._puts).toHaveLength(0);
    expect((db._tables.get("cost_ledger") ?? [])).toHaveLength(0);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("batch_generate rejects count > 6 before creating assets or cost rows", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    const res = await executeTool("batch_generate", { prompt: "too many", count: 7 }, OWNER);
    expect(res.success).toBe(false);
    expect(res.error).toBe("count must be <= 6");
    expect(db._tables.get("assets")?.length ?? 0).toBe(0);
    expect(db._tables.get("cost_ledger")?.length ?? 0).toBe(0);
    expect((storage as any)._puts.length).toBe(0);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("records an agent_tool_call event for observability", async () => {
    seedCard();
    await executeTool("get_card_layers", { cardId: "card1" }, OWNER);
    const evts = db._tables.get("events") ?? [];
    const toolEvt = evts.find((e: any) => e.code === "agent_tool_call");
    expect(toolEvt).toBeTruthy();
    expect(toolEvt.level).toBe("info");
    expect(JSON.parse(toolEvt.metaJson)).toMatchObject({ tool: "get_card_layers", success: true });
  });
});

describe("agent tool loop", () => {
  beforeEach(() => { db._reset(); (ctx as any)._background = []; (storage as any)._resetPuts(); });
  afterEach(() => {
    vi.restoreAllMocks();
    secret.values.delete("OPENAI_API_KEY");
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  function scripted(turns: ModelTurn[]): { turn: (m: ChatMessage[], onDelta: (d: string) => Promise<void>) => Promise<ModelTurn>; calls: ChatMessage[][] } {
    const calls: ChatMessage[][] = [];
    let i = 0;
    const turn = async (messages: ChatMessage[], onDelta: (d: string) => Promise<void>) => {
      calls.push(messages.map((m) => ({ ...m })));
      const t = turns[Math.min(i, turns.length - 1)];
      i += 1;
      if (t.text) await onDelta(t.text);
      return t;
    };
    return { turn, calls };
  }

  function toolTurn(name: string, args: Record<string, unknown>): ModelTurn {
    return { text: "", toolCalls: [{ id: `call_${name}`, name, args, rawArguments: JSON.stringify(args) }], finishReason: "tool_calls" };
  }

  function seedReferenceAssets(): void {
    (storage as any)._seedObject("magpie-media", "assets/uploads/forced.png", 8, new Date(0), "image/png");
    (storage as any)._seedObject("magpie-media", "assets/uploads/model-picked.png", 7, new Date(0), "image/png");
    db._seed(assets, [
      {
        id: "asset_forced",
        ownerUserId: "owner",
        status: "ready",
        source: "upload",
        name: "User attached reference",
        s3Uri: "s3://magpie-media/assets/uploads/forced.png",
        contentType: "image/png",
        byteSize: 8,
        tagsJson: "[]",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "asset_model_pick",
        ownerUserId: "owner",
        status: "ready",
        source: "upload",
        name: "Model searched reference",
        s3Uri: "s3://magpie-media/assets/uploads/model-picked.png",
        contentType: "image/png",
        byteSize: 7,
        tagsJson: "[]",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
  }

  it("executes a tool then streams a final answer, emitting tool_call_start/result", async () => {
    db._seed(assets, [{ id: "asset_cat", name: "Cat", description: "a cat", s3Uri: "r2://m/c.png", tagsJson: "[]", createdAt: 1 }]);
    const events: AgentLoopEvent[] = [];
    const { turn } = scripted([toolTurn("search_asset", { query: "cat" }), { text: "Found a cat for you.", toolCalls: [], finishReason: "stop" }]);
    const result = await runToolLoop({ prompt: "find a cat", ctx: OWNER, turn, emit: (e) => void events.push(e) });
    expect(result.toolCallsMade).toBe(1);
    expect(result.hitMaxIterations).toBe(false);
    expect(result.text).toBe("Found a cat for you.");
    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call_start");
    expect(types).toContain("tool_call_result");
    const start = events.find((e) => e.type === "tool_call_start")!;
    expect(start).toMatchObject({ tool: "search_asset", args: { query: "cat" } });
    const done = events.find((e) => e.type === "tool_call_result")!;
    expect(done).toMatchObject({ tool: "search_asset", success: true });
  });

  it("chains search → generate → add across multiple tool turns", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    delete process.env.OPENAI_API_KEY;
    db._seed(assets, [{ id: "asset_seed", name: "Cat", description: "a cat", s3Uri: "r2://m/c.png", tagsJson: "[]", createdAt: 1 }]);
    seedCard();
    const order: string[] = [];
    const { turn } = scripted([
      toolTurn("search_asset", { query: "cat" }),
      toolTurn("generate_asset", { prompt: "a coral cat", transparent: true }),
      toolTurn("add_layer_to_card", { cardId: "card1", layer: { type: "asset", assetId: "asset_seed", x: 800, y: 40, width: 200, height: 200 } }),
      { text: "Added the cat to the top-right.", toolCalls: [], finishReason: "stop" },
    ]);
    const result = await runToolLoop({
      prompt: "find a cat and add it top-right",
      cardId: "card1",
      ctx: OWNER,
      turn,
      emit: (e) => {
        if (e.type === "tool_call_start" && e.tool) order.push(e.tool);
      },
    });
    expect(result.toolCallsMade).toBe(3);
    expect(order).toEqual(["search_asset", "generate_asset", "add_layer_to_card"]);
    const spec = JSON.parse(db._tables.get("cards")![0].cardSpecJson);
    expect(spec.layers).toHaveLength(2); // bg + the added asset layer
    expect(spec.layers[1]).toMatchObject({ kind: "asset", assetId: "asset_seed" });
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("calls onToolPhaseSettled after the tool batch with cumulative results (R11 eager-completion hook)", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    delete process.env.OPENAI_API_KEY;
    const settledSnapshots: any[] = [];
    const { turn } = scripted([
      toolTurn("generate_asset", { prompt: "a coral leaf", transparent: true }),
      { text: "Generated and added.", toolCalls: [], finishReason: "stop" },
    ]);
    await runToolLoop({
      prompt: "make a coral leaf sticker",
      ctx: OWNER,
      turn,
      emit: () => {},
      onToolPhaseSettled: (settled) => { settledSnapshots.push(settled.map((s: any) => ({ tool: s.tool, success: s.success, assetId: s.resultPreview?.assetId }))); },
    });
    // Fired once (one tool-producing iteration), before the trailing summary turn, with the
    // successful generate_asset result + its assetId available for eager completion.
    expect(settledSnapshots.length).toBe(1);
    expect(settledSnapshots[0][0]).toMatchObject({ tool: "generate_asset", success: true });
    expect(typeof settledSnapshots[0][0].assetId).toBe("string");
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("emits batch_generate tool_call_result with assetIds", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    const events: AgentLoopEvent[] = [];
    const { turn } = scripted([
      toolTurn("batch_generate", { prompt: "two coral leaf stickers", count: 2, transparent: true }),
      { text: "Generated two options.", toolCalls: [], finishReason: "stop" },
    ]);
    const result = await runToolLoop({ prompt: "make two leaf options", ctx: OWNER, turn, emit: (e) => void events.push(e) });
    expect(result.toolCallsMade).toBe(1);
    const done = events.find((e) => e.type === "tool_call_result" && e.tool === "batch_generate")!;
    expect(done.success).toBe(true);
    expect(done.resultPreview?.assetIds).toHaveLength(2);
    expect((db._tables.get("assets") ?? []).every((a: any) => a.status === "generating")).toBe(true);
    expect((storage as any)._puts.length).toBe(0);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("injects run-attached referenceAssetIds into generate_asset and passes those bytes to the image edit call", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.set("OPENAI_API_KEY", "sk-test");
    seedReferenceAssets();
    let requestUrl = "";
    let requestInit: RequestInit | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlString = String(url);
      if (urlString.includes("/v1/images/edits")) {
        requestUrl = urlString;
        requestInit = init ?? null;
        return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv3CJwAAAABJRU5ErkJggg==" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "Forced reference result." } }] }), { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const { turn } = scripted([
      toolTurn("generate_asset", { prompt: "same-style coral badge", transparent: true, referenceAssetIds: ["asset_model_pick"] }),
      { text: "Generated the referenced badge.", toolCalls: [], finishReason: "stop" },
    ]);
    await runToolLoop({
      prompt: "make one using the attached reference",
      ctx: { ...OWNER, referenceAssetIds: ["asset_forced"] },
      turn,
      emit: (e) => void events.push(e),
    });

    const start = events.find((e) => e.type === "tool_call_start" && e.tool === "generate_asset")!;
    expect(start.args?.referenceAssetIds).toEqual(["asset_forced"]);
    expect(requestUrl).toBe("https://api.openai.com/v1/images/edits");
    const form = requestInit?.body as FormData;
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.getAll("image")).toHaveLength(1);
    const refBlob = form.get("image") as Blob;
    expect(refBlob.type).toBe("image/png");
    expect(refBlob.size).toBe(8);

    const generated = (db._tables.get("assets") ?? []).find((a: any) => a.source === "agent-gen");
    expect(generated).toMatchObject({ status: "ready", ownerUserId: "owner", agentRunId: OWNER.runId });
    expect(JSON.parse(generated.provenanceJson).referenceAssetIds).toEqual(["asset_forced"]);
    await (ctx as any)._drainBackground();
  });

  it("runAgentRun harvests batch_generate assetIds into output refs and completes early", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    db._seed(agentRuns, [{
      id: "run_batch",
      userId: "owner",
      provider: "openai",
      model: "gpt-4.1-mini",
      state: "running",
      prompt: "make two options",
      planJson: JSON.stringify({ streamEvents: [] }),
      toolsJson: JSON.stringify(AGENT_TOOL_NAMES),
      outputRefsJson: "[]",
      costMicros: 0,
      createdAt: Date.now(),
      startedAt: Date.now(),
    }]);
    const { turn } = scripted([
      toolTurn("batch_generate", { prompt: "two coral seed stickers", count: 2, transparent: true }),
      { text: "Generated two sticker options.", toolCalls: [], finishReason: "stop" },
    ]);
    await runAgentRun({ runId: "run_batch", userId: "owner", prompt: "make two options", turn });
    const run = db._tables.get("agent_runs")![0];
    expect(run.state).toBe("completed");
    const refs = JSON.parse(run.outputRefsJson);
    expect(refs.filter((r: any) => r.type === "asset")).toHaveLength(2);
    const events = JSON.parse(run.planJson).streamEvents;
    const toolResult = events.find((e: any) => e.type === "tool_call_result" && e.tool === "batch_generate");
    expect(toolResult.resultPreview.assetIds).toHaveLength(2);
    expect((db._tables.get("assets") ?? []).filter((a: any) => a.status === "generating")).toHaveLength(2);
    expect((db._tables.get("cost_ledger") ?? []).filter((r: any) => String(r.operation).startsWith("openai.imagegen.")).length).toBe(0);
    vars.values.set("DAILY_LLM_BUDGET_USD", "0.02");
  });

  it("runAgentRun forces attached referenceAssetIds into batch_generate instead of a model-chosen substitute", async () => {
    vars.values.set("DAILY_LLM_BUDGET_USD", "5");
    secret.values.delete("OPENAI_API_KEY");
    delete process.env.OPENAI_API_KEY;
    seedReferenceAssets();
    db._seed(agentRuns, [{
      id: "run_forced_refs",
      userId: "owner",
      provider: "openai",
      model: "gpt-4.1-mini",
      state: "running",
      prompt: "make one referenced option",
      planJson: JSON.stringify({ referenceAssetIds: ["asset_forced"], streamEvents: [] }),
      toolsJson: JSON.stringify(AGENT_TOOL_NAMES),
      outputRefsJson: "[]",
      costMicros: 0,
      createdAt: Date.now(),
      startedAt: Date.now(),
    }]);
    const { turn } = scripted([
      toolTurn("batch_generate", { prompt: "same style model-picked option", count: 1, transparent: false, model: "gpt-image-2", referenceAssetIds: ["asset_model_pick"] }),
      { text: "Queued one option.", toolCalls: [], finishReason: "stop" },
    ]);
    await runAgentRun({ runId: "run_forced_refs", userId: "owner", prompt: "make one referenced option", referenceAssetIds: ["asset_forced"], turn });

    const run = db._tables.get("agent_runs")!.find((r: any) => r.id === "run_forced_refs");
    const events = JSON.parse(run.planJson).streamEvents;
    const toolStart = events.find((e: any) => e.type === "tool_call_start" && e.tool === "batch_generate");
    expect(toolStart.args.referenceAssetIds).toEqual(["asset_forced"]);
    expect(toolStart.args.model).toBe("gpt-image-1");
    const generated = (db._tables.get("assets") ?? []).filter((a: any) => a.source === "agent-gen");
    expect(generated).toHaveLength(1);
    const provenance = JSON.parse(generated[0].provenanceJson);
    expect(provenance.referenceAssetIds).toEqual(["asset_forced"]);
    expect(provenance.model).toBe("gpt-image-1");
    expect(provenance.referenceAssetIds).not.toContain("asset_model_pick");
    const refs = JSON.parse(run.outputRefsJson);
    expect(refs.filter((r: any) => r.type === "asset")).toHaveLength(1);
    expect((storage as any)._puts.length).toBe(0);
  });

  it("caps tool iterations at MAX_ITERATIONS", async () => {
    seedCard();
    // A model that never stops calling tools.
    const { turn } = scripted([toolTurn("get_card_layers", { cardId: "card1" })]);
    const result = await runToolLoop({ prompt: "loop forever", cardId: "card1", ctx: OWNER, turn, emit: () => {} });
    expect(result.toolCallsMade).toBe(MAX_ITERATIONS);
    expect(result.hitMaxIterations).toBe(true);
  });
});

describe("openAiTurn streaming parse", () => {
  beforeEach(() => {
    db._reset();
    secret.values.set("OPENAI_API_KEY", "sk-test");
  });
  afterEach(() => {
    secret.values.delete("OPENAI_API_KEY");
    vi.unstubAllGlobals();
  });

  function sseResponse(chunks: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  it("forces batch_generate as tool_choice for explicit multi-image requests", async () => {
    let requestBody: any = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      return sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Queued." }, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    });
    await openAiTurn([{ role: "user", content: "Create exactly 2 generated image options." }], async () => {});
    expect(requestBody.tool_choice).toEqual({ type: "function", function: { name: "batch_generate" } });
  });

  it("assembles a tool_call from fragmented streaming deltas", async () => {
    vi.stubGlobal("fetch", async () => sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_abc", function: { name: "search_asset", arguments: '{"que' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"cat"}' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]));
    const deltas: string[] = [];
    const turn = await openAiTurn([{ role: "user", content: "find a cat" }], async (d) => void deltas.push(d));
    expect(turn.finishReason).toBe("tool_calls");
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toMatchObject({ id: "call_abc", name: "search_asset", args: { query: "cat" } });
    expect(deltas).toHaveLength(0);
  });

  it("returns streamed text when the model does not call a tool", async () => {
    vi.stubGlobal("fetch", async () => sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello " } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "world" }, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]));
    const deltas: string[] = [];
    const turn = await openAiTurn([{ role: "user", content: "hi" }], async (d) => void deltas.push(d));
    expect(turn.text).toBe("Hello world");
    expect(turn.toolCalls).toHaveLength(0);
    expect(deltas).toEqual(["Hello ", "world"]);
  });
});
