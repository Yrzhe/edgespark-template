import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Clock, Filter, Radio, Search } from "lucide-react";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { arenaApi } from "@/lib/api";
import { CREAM, GREEN, INK, NAVY, ORANGE, RED } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ContestantSummary, Decision } from "@/lib/types";

export default function DecisionsPage() {
  const { t } = useTranslation();
  const [contestants, setContestants] = useState<ContestantSummary[]>([]);
  const [minutes, setMinutes] = useState<Array<{ minute: number; items: Decision[] }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load(reset = false) {
    const [roster, data] = await Promise.all([
      arenaApi.contestants(),
      arenaApi.decisionsByMinute({ cursor: reset ? null : cursor, limit: 20 }),
    ]);
    setContestants(roster.contestants);
    setMinutes((prev) => reset ? data.minutes : [...prev, ...data.minutes]);
    setCursor(data.nextCursor);
  }

  useEffect(() => { void load(true); }, []);

  const visible = minutes
    .map((bucket) => ({
      ...bucket,
      items: bucket.items.filter((item) => (!filter || item.contestantId === filter) && (!search || `${item.symbol} ${item.action} ${item.reasoning ?? ""} ${item.justification ?? ""}`.toLowerCase().includes(search.toLowerCase()))),
    }))
    .filter((bucket) => bucket.items.length);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM, color: INK }}>
      <header className="mx-6 mt-5 flex min-h-14 flex-wrap items-center gap-3 rounded-2xl border bg-white px-5 py-3" style={{ borderColor: "#0C0A0F14" }}>
        <h1 className="ml-1 text-lg font-extrabold">{t("decisions.title")}</h1>
        <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: ORANGE }}><Radio size={12} />{t("decisions.byMinute")}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs" style={{ borderColor: INK }}>
            <Filter size={13} />
            <select className="bg-transparent font-semibold outline-none" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("decisions.filter")}>
              <option value="">{t("app.all")}</option>
              {contestants.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <div className="flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs" style={{ borderColor: INK, color: "#4A4A4F" }}>
            <Search size={13} />
            <input className="w-28 bg-transparent outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("decisions.searchSymbol")} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[920px] p-6">
        <div className="relative pl-7">
          <div className="absolute bottom-2 left-2 top-2 w-0.5" style={{ background: "#0C0A0F18" }} />
          {visible.length ? visible.map((bucket) => (
            <div key={bucket.minute} className="relative mb-6">
              <span className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border-2" style={{ background: ORANGE, borderColor: CREAM }} />
              <div className="mb-2 flex items-center gap-2">
                <Clock size={14} color={NAVY} /><span className="font-extrabold">{formatDate(bucket.minute)}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: "#fff", border: "1px solid #0C0A0F22", color: "#4A4A4F" }}>{t("decisions.count", { count: bucket.items.length })}</span>
              </div>
              <div className="flex flex-col gap-2">
                {bucket.items.map((decision) => {
                  const contestant = contestants.find((c) => c.id === decision.contestantId);
                  const key = `${bucket.minute}-${decision.id}`;
                  const text = decision.chainOfThought ?? decision.justification ?? decision.reasoning;
                  return (
                    <div key={key} className="rounded-xl border-2 bg-white" style={{ borderColor: "#0C0A0F12" }}>
                      <button onClick={() => setOpen(open === key ? null : key)} className="flex w-full items-center gap-2.5 p-3 text-left">
                        <ContestantAvatar name={contestant?.displayName ?? decision.contestantId} company={`${contestant?.company ?? contestant?.tagline ?? ""} ${contestant?.displayName ?? ""}`} avatarUrl={contestant?.avatarUrl ?? null} color={contestant?.accentColor ?? NAVY} size="sm" />
                        <span className="w-32 truncate text-sm font-bold">{contestant?.displayName ?? decision.contestantId}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: actColor(decision.action) }}>{decision.action} {decision.symbol}</span>
                        <span className="flex-1 truncate text-sm" style={{ color: "#4A4A4F" }}>{decision.reasoning ?? decision.justification ?? t("app.empty")}</span>
                        <span className="text-[11px]" style={{ color: "#4A4A4F" }}>{t("decisions.confidence")} {decision.confidence ?? "-"}</span>
                        {text && (open === key ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </button>
                      {text && open === key && <pre className="whitespace-pre-wrap px-3 pb-3 font-mono text-[12px] leading-relaxed" style={{ color: "#4A4A4F" }}>{text}</pre>}
                    </div>
                  );
                })}
              </div>
            </div>
          )) : <SkeletonTimeline />}
          {cursor && <button className="ml-1 rounded-lg border-2 px-4 py-2 text-xs font-bold" style={{ borderColor: INK }} onClick={() => void load()}>{t("app.loadMore")}</button>}
        </div>
      </main>
    </div>
  );
}

function SkeletonTimeline() {
  return <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl border-2 bg-white" style={{ borderColor: "#0C0A0F12" }} />)}</div>;
}

function actColor(action: string) {
  const normalized = action.toUpperCase();
  return normalized === "BUY" ? GREEN : normalized === "SELL" ? RED : "#4A4A4F";
}
