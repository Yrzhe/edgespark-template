import { useEffect, useRef } from "react";

import { arenaApi } from "@/lib/api";

const PUMP_INTERVAL_MS = 20000;
const MIN_GAP_MS = 18000;
const LAST_SYNC_STORAGE = "arena.lastSyncAt";
const LAST_SYNC_EVENT = "arena:last-sync";
let sharedRunning = false;
let sharedLastRun = 0;

export function useUpstreamPump() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let cancelled = false;

    async function run(force = false) {
      if (cancelled || document.visibilityState === "hidden") return;
      await runUpstreamPumpOnce({ force, throttle: true, requireLive: true });
    }

    void run(true);
    const timer = window.setInterval(() => void run(false), PUMP_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
}

export async function runUpstreamPumpOnce({ force = true, throttle = false, requireLive = false }: { force?: boolean; throttle?: boolean; requireLive?: boolean } = {}) {
  if (sharedRunning) return null;
  const now = Date.now();
  if (throttle && !force && now - sharedLastRun < MIN_GAP_MS) return null;
  sharedRunning = true;
  sharedLastRun = now;
  try {
    const competition = await arenaApi.competition();
    if (requireLive && competition.status !== "live") return null;
    const base = competition.upstreamBaseUrl;
    if (!base) return null;
    const [agents, snapshots, decisions] = await Promise.all([
      fetchJson(joinUrl(base, "/agents")),
      fetchJson(joinUrl(base, "/snapshots")),
      fetchJson(joinUrl(base, "/agent/decisions")),
    ]);
    const body: { agents?: unknown; snapshots?: unknown; decisions?: unknown } = {};
    if (agents.ok) body.agents = agents.data;
    if (snapshots.ok) body.snapshots = snapshots.data;
    if (decisions.ok) body.decisions = decisions.data;
    if (!Object.keys(body).length) return null;
    await arenaApi.ingest(body);
    const syncedAt = Date.now();
    localStorage.setItem(LAST_SYNC_STORAGE, String(syncedAt));
    window.dispatchEvent(new CustomEvent(LAST_SYNC_EVENT, { detail: syncedAt }));
    return syncedAt;
  } catch {
    return null;
  } finally {
    sharedRunning = false;
  }
}

export function readLastSyncAt() {
  const value = Number(localStorage.getItem(LAST_SYNC_STORAGE));
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchJson(url: string): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

function joinUrl(base: string, path: string) {
  if (base.startsWith("/")) return `${base.replace(/\/$/, "")}${path}`;
  return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).toString();
}
