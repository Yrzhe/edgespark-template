import { useTranslation } from "react-i18next";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { GREEN, NAVY, RED } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ContestantSummary, Decision } from "@/lib/types";

export function DecisionCard({
  decision,
  expanded,
  onToggle,
  contestants = [],
}: {
  decision: Decision;
  expanded: boolean;
  onToggle?: () => void;
  contestants?: ContestantSummary[];
}) {
  const { t } = useTranslation();
  const contestant = contestants.find((item) => item.id === decision.contestantId);
  return (
    <article className="rounded-lg border-2 p-3" style={{ borderColor: "#0C0A0F22" }}>
      <div className="flex flex-wrap items-center gap-2">
        {contestant && <ContestantAvatar name={contestant.displayName} company={`${contestant.company ?? contestant.tagline} ${contestant.displayName}`} avatarUrl={contestant.avatarUrl} color={contestant.accentColor} size="sm" />}
        <span className="rounded px-2 py-1 text-xs font-black text-white" style={{ background: decision.action.toLowerCase().includes("sell") ? RED : GREEN }}>{decision.action}</span>
        <span className="font-black">{decision.symbol}</span>
        <span className="text-sm font-semibold text-zinc-500">@{decision.contestantId}</span>
        <span className="ml-auto text-xs font-bold text-zinc-500">{formatDate(decision.timestamp)}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-700">{decision.reasoning || decision.justification}</p>
      {decision.chainOfThought && onToggle && <button onClick={onToggle} className="mt-2 text-xs font-black" style={{ color: NAVY }}>{expanded ? t("contestant.collapse") : t("contestant.chain")}</button>}
      {expanded && decision.chainOfThought && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">{decision.chainOfThought}</pre>}
    </article>
  );
}
