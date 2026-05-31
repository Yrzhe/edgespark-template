import { beforeEach, describe, expect, it } from "vitest";
import { db } from "edgespark";
import { agentRuns, assets } from "@defs";
import { reconcileAssetRow, reconcileRunRow, STALE_GENERATING_MS } from "../src/lib/reconcile";

describe("read-time reconcile (M-102 layer 2 — no infinite spinner)", () => {
  beforeEach(() => db._reset());

  it("flips a stale generating asset to failed and persists it", async () => {
    const created = 1_000_000;
    const now = created + STALE_GENERATING_MS + 1;
    db._seed(assets, [{ id: "asset_stuck", status: "generating", s3Uri: "s3://magpie-media/x.png", contentType: "image/png", byteSize: 0, tagsJson: "[]", provenanceJson: "{}", createdAt: created, updatedAt: created }]);
    const out = await reconcileAssetRow(db._tables.get("assets")![0], now);
    expect(out.status).toBe("failed");
    expect(db._tables.get("assets")![0].status).toBe("failed"); // persisted
    expect(JSON.parse(db._tables.get("assets")![0].provenanceJson).error).toBe("render_timeout_reconciled");
  });

  it("leaves a still-fresh generating asset untouched", async () => {
    const created = 1_000_000;
    const now = created + 5_000; // well within the threshold
    db._seed(assets, [{ id: "asset_fresh", status: "generating", s3Uri: "s3://magpie-media/x.png", contentType: "image/png", byteSize: 0, tagsJson: "[]", provenanceJson: "{}", createdAt: created, updatedAt: created }]);
    const out = await reconcileAssetRow(db._tables.get("assets")![0], now);
    expect(out.status).toBe("generating");
    expect(db._tables.get("assets")![0].status).toBe("generating");
  });

  it("never touches a ready asset", async () => {
    db._seed(assets, [{ id: "asset_ok", status: "ready", s3Uri: "s3://magpie-media/x.png", contentType: "image/png", byteSize: 9, tagsJson: "[]", provenanceJson: "{}", createdAt: 1, updatedAt: 1 }]);
    const out = await reconcileAssetRow(db._tables.get("assets")![0], 9_999_999_999);
    expect(out.status).toBe("ready");
  });

  it("flips a stale running run to failed and persists it", async () => {
    const started = 1_000_000;
    const now = started + STALE_GENERATING_MS + 1;
    db._seed(agentRuns, [{ id: "run_stuck", state: "running", prompt: "x", planJson: "{}", toolsJson: "[]", outputRefsJson: "[]", costMicros: 0, createdAt: started, startedAt: started }]);
    const out = await reconcileRunRow(db._tables.get("agent_runs")![0], now);
    expect(out.state).toBe("failed");
    const row = db._tables.get("agent_runs")![0];
    expect(row.state).toBe("failed");
    expect(row.errorCode).toBe("run_timeout_reconciled");
    expect(row.finishedAt).toBe(now);
  });

  it("leaves a fresh running run untouched", async () => {
    const started = 1_000_000;
    db._seed(agentRuns, [{ id: "run_fresh", state: "running", prompt: "x", planJson: "{}", toolsJson: "[]", outputRefsJson: "[]", costMicros: 0, createdAt: started, startedAt: started }]);
    const out = await reconcileRunRow(db._tables.get("agent_runs")![0], started + 1_000);
    expect(out.state).toBe("running");
  });

  it("reconciles a stale running run that PRODUCED output to completed, not failed (R11)", async () => {
    const started = 1_000_000;
    const now = started + STALE_GENERATING_MS + 1;
    // Run made a successful generate_asset tool call (persisted in stream events) but its
    // completion write missed the window → must reconcile to completed, NOT failed.
    const plan = { streamEvents: [{ type: "tool_call_result", tool: "generate_asset", success: true }] };
    db._seed(agentRuns, [{ id: "run_made_asset", state: "running", prompt: "gen", planJson: JSON.stringify(plan), toolsJson: "[]", outputRefsJson: "[]", costMicros: 0, createdAt: started, startedAt: started }]);
    const out = await reconcileRunRow(db._tables.get("agent_runs")![0], now);
    expect(out.state).toBe("completed");
    expect(db._tables.get("agent_runs")![0].state).toBe("completed");
    expect(db._tables.get("agent_runs")![0].errorCode ?? null).toBeNull(); // not a failure
  });

  it("reconciles a stale running run with output refs to completed", async () => {
    const started = 1_000_000;
    const now = started + STALE_GENERATING_MS + 1;
    db._seed(agentRuns, [{ id: "run_refs", state: "running", prompt: "gen", planJson: "{}", toolsJson: "[]", outputRefsJson: JSON.stringify([{ type: "asset", assetId: "asset_x" }]), costMicros: 0, createdAt: started, startedAt: started }]);
    const out = await reconcileRunRow(db._tables.get("agent_runs")![0], now);
    expect(out.state).toBe("completed");
  });
});
