import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { agentRuns, assets } from "@defs";
import { parseJson } from "./json";
import { pendingAssetIsLazy } from "./imagegen/materialize";

// Read-time reconcile (M-102 layer 2). The inline-render fix means an asset/run should never
// linger in a non-terminal state, but if a render ever genuinely outlives the Worker window the
// row could be left as "generating"/"running". Rather than show an infinite spinner, every read
// path converts such a stale row to a terminal "failed" (persisted) so the UI offers a retry.
export const STALE_GENERATING_MS = 90_000;
export const STALE_RUNNING_MS = 90_000;

// If the asset row is still "generating" past the threshold, mark it failed (persist) and return
// the failed row. Otherwise return the row unchanged. Safe to call on any/empty row.
export async function reconcileAssetRow<T extends Record<string, any> | null | undefined>(row: T, now = Date.now()): Promise<T> {
  if (!row || (row.status !== "generating" && row.status !== "rendering")) return row;
  if (pendingAssetIsLazy(row)) {
    if (row.status === "rendering" && now - Number(row.updatedAt ?? row.createdAt ?? 0) > STALE_GENERATING_MS) {
      await db.update(assets).set({ status: "generating", updatedAt: now }).where(eq(assets.id, row.id)).catch(() => undefined);
      return { ...row, status: "generating", updatedAt: now } as T;
    }
    return row;
  }
  if (now - Number(row.createdAt ?? 0) <= STALE_GENERATING_MS) return row;
  const provenance = parseJson<Record<string, unknown>>(row.provenanceJson, {});
  const provenanceJson = JSON.stringify({ ...provenance, error: provenance.error ?? "render_timeout_reconciled" });
  await db.update(assets).set({ status: "failed", provenanceJson, updatedAt: now }).where(eq(assets.id, row.id)).catch(() => undefined);
  return { ...row, status: "failed", provenanceJson } as T;
}

// Batch helper for list endpoints.
export async function reconcileAssetRows<T extends Record<string, any>>(rows: T[], now = Date.now()): Promise<T[]> {
  return Promise.all(rows.map((row) => reconcileAssetRow(row, now)));
}

// If the agent run is still "running" past the threshold, reconcile it to a terminal state and
// persist. Crucially (M-102 R11), a run that already produced successful output — a generated
// asset, an added layer, any successful tool_call_result — is reconciled to COMPLETED, not
// failed: the work succeeded, only the completion write missed the Worker window. Only a run
// with NO successful output becomes failed.
export async function reconcileRunRow<T extends Record<string, any> | null | undefined>(row: T, now = Date.now()): Promise<T> {
  if (!row || row.state !== "running") return row;
  const since = Number(row.startedAt ?? row.createdAt ?? 0);
  if (now - since <= STALE_RUNNING_MS) return row;
  if (runHasSuccessfulOutput(row)) {
    await db.update(agentRuns).set({ state: "completed", finishedAt: now }).where(eq(agentRuns.id, row.id)).catch(() => undefined);
    return { ...row, state: "completed", finishedAt: now } as T;
  }
  await db
    .update(agentRuns)
    .set({ state: "failed", finishedAt: now, errorCode: "run_timeout_reconciled", errorMessage: "Run exceeded the render window with no output and was reconciled to failed." })
    .where(eq(agentRuns.id, row.id))
    .catch(() => undefined);
  return { ...row, state: "failed", finishedAt: now, errorCode: "run_timeout_reconciled" } as T;
}

// A run "produced output" if any tool call succeeded (from the persisted stream events) or it has
// any output refs recorded.
function runHasSuccessfulOutput(row: Record<string, any>): boolean {
  const refs = parseJson<unknown[]>(row.outputRefsJson, []);
  if (Array.isArray(refs) && refs.length > 0) return true;
  const plan = parseJson<Record<string, unknown>>(row.planJson, {});
  const events = Array.isArray(plan.streamEvents) ? (plan.streamEvents as Array<Record<string, unknown>>) : [];
  return events.some((e) => e?.type === "tool_call_result" && e?.success === true);
}
