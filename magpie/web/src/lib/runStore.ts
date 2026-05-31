// Per-card agent-run persistence (M-227).
//
// Agent runs used to live only in EditorRoute's in-memory state, so navigating away from the
// editor and back lost any in-progress (or recent) run. We persist just the run *ids* per card
// in localStorage — the authoritative run state is re-hydrated by re-fetching the run and
// re-subscribing to its SSE stream, which the server replays in full (M-041). Storing ids only
// keeps this resilient to schema changes and avoids stale snapshots.

const PREFIX = "magpie:card-runs:";
const MAX_PER_CARD = 8;

export function getCardRunIds(cardId: string | null | undefined): string[] {
  if (!cardId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREFIX + cardId);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberCardRun(cardId: string | null | undefined, runId: string | null | undefined): void {
  if (!cardId || !runId || typeof localStorage === "undefined") return;
  try {
    const next = [runId, ...getCardRunIds(cardId).filter((id) => id !== runId)].slice(0, MAX_PER_CARD);
    localStorage.setItem(PREFIX + cardId, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private mode / quota) — degrade to in-memory only.
  }
}
