import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";

import { arenaApi, ApiError } from "@/lib/api";
import { ORANGE } from "@/lib/constants";
import type { CompetitionStatus } from "@/lib/types";

export function VoteButton({
  contestantId,
  enabled,
  authenticated,
  onLogin,
  onTotal,
  compact = false,
  status = "live",
  seasonId = "current",
}: {
  contestantId: string;
  enabled: boolean;
  authenticated: boolean;
  onLogin: () => void;
  onTotal?: (total: number) => void;
  compact?: boolean;
  status?: CompetitionStatus;
  seasonId?: string;
}) {
  const { t } = useTranslation();
  const [queued, setQueued] = useState(0);
  const [draftVoted, setDraftVoted] = useState(() => readDraftVote(seasonId));
  const queuedRef = useRef(0);
  const timer = useRef<number | null>(null);
  const flushTimer = useRef<number | null>(null);

  useEffect(() => {
    const update = () => setDraftVoted(readDraftVote(seasonId));
    update();
    window.addEventListener("arena:draft-vote", update);
    return () => window.removeEventListener("arena:draft-vote", update);
  }, [seasonId]);

  async function flush() {
    const count = Math.min(25, queuedRef.current);
    if (!count) return;
    queuedRef.current -= count;
    setQueued(queuedRef.current);
    try {
      const result = await arenaApi.vote(contestantId, count);
      onTotal?.(result.total);
    } catch (err) {
      if (isAlreadyVoted(err)) markDraftVote(seasonId);
      queuedRef.current = 0;
      setQueued(0);
    }
  }

  async function draftVote() {
    if (!authenticated) return onLogin();
    if (!enabled || draftVoted) return;
    try {
      const result = await arenaApi.vote(contestantId, 1);
      onTotal?.(result.total);
      markDraftVote(seasonId);
    } catch (err) {
      if (isAlreadyVoted(err)) markDraftVote(seasonId);
    }
  }

  function start() {
    if (!authenticated) return onLogin();
    if (!enabled || status !== "live") return;
    stop();
    const add = () => {
      queuedRef.current += 1;
      setQueued(queuedRef.current);
    };
    add();
    timer.current = window.setInterval(add, 100);
    flushTimer.current = window.setInterval(() => void flush(), 700);
  }

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    if (flushTimer.current) window.clearInterval(flushTimer.current);
    timer.current = null;
    flushTimer.current = null;
    void flush();
  }

  const disabled = !enabled || status === "ended" || (status === "draft" && draftVoted);
  const label = status === "draft" ? (draftVoted ? t("vote.voted") : t("vote.once")) : status === "ended" ? t("vote.closed") : t("vote.hold");

  return (
    <button onPointerDown={status === "draft" ? () => void draftVote() : start} onPointerUp={stop} onPointerLeave={stop} className={compact ? "relative grid h-8 w-8 place-items-center rounded-full border-2 transition-transform active:scale-90 disabled:opacity-50" : "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-black text-white disabled:opacity-50"} disabled={disabled} style={compact ? { borderColor: "#0C0A0F", background: "#F7F5F1" } : { background: ORANGE }} title={label}>
      <Heart size={compact ? 15 : 18} fill={compact ? ORANGE : "white"} color={compact ? ORANGE : "currentColor"} />
      {!compact && label}
      {queued > 0 && <span className={compact ? "absolute -top-2 left-1/2 rounded-full px-1 text-[10px] font-black text-white" : "rounded bg-white/20 px-2 py-0.5"} style={compact ? { background: ORANGE } : undefined}>{queued}</span>}
    </button>
  );
}

function draftVoteKey(seasonId: string) {
  return `arena.draftVoted.${seasonId}`;
}

function readDraftVote(seasonId: string) {
  return localStorage.getItem(draftVoteKey(seasonId)) === "1";
}

function markDraftVote(seasonId: string) {
  localStorage.setItem(draftVoteKey(seasonId), "1");
  window.dispatchEvent(new Event("arena:draft-vote"));
}

function isAlreadyVoted(err: unknown) {
  return err instanceof ApiError && (err.status === 409 || err.message.toLowerCase().includes("already"));
}
