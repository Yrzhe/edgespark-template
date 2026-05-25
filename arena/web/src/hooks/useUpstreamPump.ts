import { useEffect, useRef } from "react";

import { arenaApi } from "@/lib/api";

const PUMP_INTERVAL_MS = 45000;
const MIN_GAP_MS = 25000;
let sharedRunning = false;
let sharedLastRun = 0;

export function useUpstreamPump() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let cancelled = false;

    async function run(force = false) {
      if (cancelled || sharedRunning || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - sharedLastRun < MIN_GAP_MS) return;
      sharedRunning = true;
      sharedLastRun = now;
      try {
        const competition = await arenaApi.competition();
        if (!force && competition.status !== "live") return;
        const base = competition.upstreamBaseUrl;
        if (!base) return;
        const [agents, snapshots, decisions] = await Promise.all([
          fetchJson(joinUrl(base, "/agents")),
          fetchJson(joinUrl(base, "/snapshots")),
          fetchJson(joinUrl(base, "/agent/decisions")),
        ]);
        const body: { agents?: unknown; snapshots?: unknown; decisions?: unknown } = {};
        if (agents.ok) body.agents = agents.data;
        if (snapshots.ok) body.snapshots = snapshots.data;
        if (decisions.ok) body.decisions = decisions.data;
        if (Object.keys(body).length) await arenaApi.ingest(body);
      } catch {
        // The pump is opportunistic; UI reads remain D1-backed public endpoints.
      } finally {
        sharedRunning = false;
      }
    }

    void run(true);
    const timer = window.setInterval(() => void run(false), PUMP_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
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
