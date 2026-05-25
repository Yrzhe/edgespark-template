import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { NavLink, useSearchParams } from "react-router-dom";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Heart,
  MessageSquare,
  MessagesSquare,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { CommentComposer, CommentList, dedupeComments } from "@/components/Comments";
import { ContestantAvatar } from "@/components/ContestantAvatar";
import { SeriesChart } from "@/components/SeriesChart";
import { useShellContext } from "@/components/Shell";
import { VoteButton } from "@/components/VoteButton";
import { arenaApi } from "@/lib/api";
import { CREAM, GREEN, INK, NAVY, ORANGE, RED } from "@/lib/constants";
import { countdown } from "@/lib/format";
import { usePoll } from "@/lib/poll";
import type { ChartMetric, Comment, CompetitionResponse, ContestantSummary, SeriesRange } from "@/lib/types";

const ranges: Array<Exclude<SeriesRange, "all">> = ["12h", "1d", "2d", "3d"];

export default function DashboardPage() {
  const { t } = useTranslation();
  const { onLogin, isAuthenticated } = useShellContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [competition, setCompetition] = useState<CompetitionResponse | null>(null);
  const [contestants, setContestants] = useState<ContestantSummary[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [range, setRange] = useState<SeriesRange>((searchParams.get("range") as SeriesRange) || "12h");
  const [metric, setMetric] = useState<ChartMetric>((searchParams.get("metric") as ChartMetric) || "votes");
  const [topN, setTopN] = useState(8);
  const [chartSeries, setChartSeries] = useState<SeriesMap>({});
  const [equityOverviewSeries, setEquityOverviewSeries] = useState<SeriesMap>({});
  const [voteOverviewSeries, setVoteOverviewSeries] = useState<SeriesMap>({});
  const selectedIds = useMemo(() => parseIds(searchParams.get("ids")), [searchParams]);
  const live = competition?.status === "live";

  async function loadBase() {
    const [nextCompetition, nextContestants, nextComments] = await Promise.all([
      arenaApi.competition(),
      arenaApi.contestants(),
      arenaApi.comments({ limit: 30 }),
    ]);
    setCompetition(nextCompetition);
    setContestants(nextContestants.contestants);
    setComments(nextComments.comments);
  }

  async function loadChartSeries() {
    const ids = selectedIds.length ? selectedIds : defaultSeriesIds(contestants, metric, topN);
    const payload = metric === "equity" ? await arenaApi.equitySeries(range, ids) : await arenaApi.voteSeries(range, ids);
    setChartSeries(toSeriesMap(payload.series));
  }

  async function loadOverviewSeries() {
    const equityIds = [...contestants].sort((a, b) => a.rank - b.rank).slice(0, 40).map((c) => c.id);
    const voteIds = [...contestants].sort((a, b) => b.votes - a.votes).slice(0, 40).map((c) => c.id);
    const [equityPayload, votePayload] = await Promise.all([
      arenaApi.equitySeries("all", equityIds),
      arenaApi.voteSeries("all", voteIds),
    ]);
    setEquityOverviewSeries(toSeriesMap(equityPayload.series));
    setVoteOverviewSeries(toSeriesMap(votePayload.series));
  }

  async function loadAllSeries() {
    await Promise.all([loadChartSeries(), loadOverviewSeries()]);
  }

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => { if (contestants.length) void loadChartSeries(); }, [contestants, range, metric, selectedIds.join(","), topN]);
  useEffect(() => { if (contestants.length) void loadOverviewSeries(); }, [contestants]);
  usePoll(() => arenaApi.competition().then(setCompetition), 6000, true);
  usePoll(() => loadBase(), 30000, live);
  usePoll(() => loadAllSeries(), 60000, live && contestants.length > 0);
  usePoll(async () => {
    const since = comments[0]?.createdAt ?? Date.now() - 30000;
    const next = await arenaApi.comments({ since });
    if (next.comments.length) setComments((prev) => dedupeComments([...next.comments, ...prev]).slice(0, 80));
  }, 3000, live);

  function updateQuery(next: Partial<{ ids: string[]; range: SeriesRange; metric: ChartMetric }>) {
    const params = new URLSearchParams(searchParams);
    if (next.ids) next.ids.length ? params.set("ids", next.ids.join(",")) : params.delete("ids");
    if (next.range) params.set("range", next.range);
    if (next.metric) params.set("metric", next.metric);
    setSearchParams(params);
  }

  const byEquity = useMemo(() => [...contestants].sort((a, b) => a.rank - b.rank), [contestants]);
  const byVotes = useMemo(() => [...contestants].sort((a, b) => b.votes - a.votes), [contestants]);
  const chartRows = useMemo(() => chartContestants(contestants, chartSeries, selectedIds, metric, topN), [contestants, chartSeries, selectedIds, metric, topN]);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM, color: INK }}>
      <DanmakuStrip comments={comments} contestants={contestants} />
      <main className="grid grid-cols-12 gap-5 p-6 max-lg:grid-cols-1">
        <section className="col-span-8 rounded-2xl border-2 bg-white p-5 max-lg:col-span-1" style={{ borderColor: INK }}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold">{metric === "equity" ? t("dashboard.equity") : t("dashboard.votes")}</h1>
              <StatusBadge competition={competition} />
              <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: NAVY }}><Clock size={15} />{competition && (live ? competition.endsAt : competition.startsAt) ? countdown((live ? competition.endsAt : competition.startsAt) as number) : t("app.loading")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segment value={String(topN)} items={[["8", t("dashboard.top8")], ["10", t("dashboard.top10")], ["20", t("dashboard.top20")]]} onChange={(value) => setTopN(Number(value))} />
              <ComparePicker contestants={contestants} selected={selectedIds} onChange={(ids) => updateQuery({ ids })} />
              <Segment value={metric} items={[["equity", t("dashboard.equity")], ["votes", t("dashboard.votes")]]} onChange={(value) => { setMetric(value as ChartMetric); updateQuery({ metric: value as ChartMetric }); }} />
              <Segment value={range} items={ranges.map((item) => [item, t(`dashboard.range${item.replace("h", "h").replace("d", "d")}`)] as [string, string])} accent onChange={(value) => { setRange(value as SeriesRange); updateQuery({ range: value as SeriesRange }); }} />
            </div>
          </div>
          <div className="mb-2 flex items-center gap-1 text-[11px]" style={{ color: "#4A4A4F" }}>
            <Activity size={11} />{t("dashboard.scrollHint")}
          </div>
          <div className="overflow-x-auto rounded-xl bg-white">
            <div className="h-[360px] min-w-[760px]">
              <SeriesChart contestants={contestants} series={chartSeries} metric={metric} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {chartRows.slice(0, 8).map((row) => <span key={row.id} className="flex items-center gap-1.5 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: row.color }} />{row.name}</span>)}
            {topN > 8 && <span className="text-xs font-semibold" style={{ color: "#4A4A4F" }}>+{topN - 8}</span>}
          </div>
        </section>

        <aside className="col-span-4 flex h-[520px] min-h-0 flex-col rounded-2xl border-2 bg-white max-lg:col-span-1" style={{ borderColor: INK }}>
          <div className="shrink-0 flex items-center gap-2 border-b-2 px-4 py-3" style={{ borderColor: "#0C0A0F14" }}>
            <MessageSquare size={16} color={ORANGE} /><h2 className="font-extrabold">{t("dashboard.comments")}</h2>
            <motion.span className="ml-1 h-1.5 w-1.5 rounded-full" style={{ background: ORANGE }} animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
            <span className="ml-auto text-[11px]" style={{ color: "#4A4A4F" }}>{t("dashboard.mentionBonus")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><CommentList comments={comments.slice(0, 8)} contestants={contestants} /></div>
          <div className="shrink-0 border-t-2 p-3" style={{ borderColor: "#0C0A0F14" }}>
            <CommentComposer contestants={contestants} enabled={competition?.status !== "ended" && !!competition?.commentsEnabled} authenticated={isAuthenticated} onLogin={onLogin} onSent={(comment) => setComments((prev) => [comment, ...prev])} status={competition?.status} />
          </div>
        </aside>

        <MagicLeaderboard kind="equity" title={t("dashboard.equityBoard")} caption={t("dashboard.official")} contestants={byEquity.slice(0, 40)} series={equityOverviewSeries} />
        <MagicLeaderboard kind="votes" title={t("dashboard.voteBoard")} caption={t("dashboard.crowd")} contestants={byVotes.slice(0, 40)} series={voteOverviewSeries} competition={competition} authenticated={isAuthenticated} onLogin={onLogin} onTotal={(id, total) => setContestants((prev) => prev.map((item) => item.id === id ? { ...item, votes: total } : item))} />
      </main>
      <footer className="flex items-center gap-2 px-7 pb-6 text-[11px]" style={{ color: "#4A4A4F" }}><Sparkles size={12} />{t("app.powered")}</footer>
    </div>
  );
}

function StatusBadge({ competition }: { competition: CompetitionResponse | null }) {
  const { t } = useTranslation();
  const status = competition?.status ?? "draft";
  const bg = status === "live" ? ORANGE : status === "ended" ? RED : "#C9742F";
  return <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: bg }}><motion.span className="h-2 w-2 rounded-full bg-white" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />{t(`app.${status}`)}</span>;
}

function Segment({ value, items, onChange, accent }: { value: string; items: Array<[string, string]>; onChange: (value: string) => void; accent?: boolean }) {
  return <div className="flex overflow-hidden rounded-lg border-2 text-xs font-bold" style={{ borderColor: INK }}>{items.map(([id, label]) => <button key={id} onClick={() => onChange(id)} className="px-2.5 py-1.5" style={{ background: value === id ? (accent ? ORANGE : INK) : "#fff", color: value === id ? "#fff" : INK }}>{label}</button>)}</div>;
}

function ComparePicker({ contestants, selected, onChange }: { contestants: ContestantSummary[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const options = contestants.filter((c) => `${c.id} ${c.displayName}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <div className="relative"><div className="flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5" style={{ borderColor: INK }}><Search size={13} /><input className="w-24 bg-transparent text-xs font-semibold outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dashboard.compare")} /></div>{(query || selected.length > 0) && <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border-2 bg-white p-2 shadow" style={{ borderColor: INK }}><div className="mb-2 flex flex-wrap gap-1">{selected.map((id) => <button key={id} onClick={() => onChange(selected.filter((item) => item !== id))} className="rounded-full px-2 py-1 text-[11px] font-black text-white" style={{ background: contestants.find((c) => c.id === id)?.accentColor ?? INK }}>@{id}</button>)}</div>{options.map((c) => <button key={c.id} onClick={() => { onChange([...new Set([...selected, c.id])]); setQuery(""); }} className="block w-full rounded-lg px-2 py-1 text-left text-xs font-bold hover:bg-zinc-100">@{c.id} · {c.displayName}</button>)}</div>}</div>;
}

function DanmakuStrip({ comments, contestants }: { comments: Comment[]; contestants: ContestantSummary[] }) {
  const { t } = useTranslation();
  const rows = comments.length ? comments : [];
  return <div className="relative flex h-10 overflow-hidden border-b" style={{ borderColor: "#0C0A0F14", background: CREAM }}><div className="z-10 flex h-full items-center gap-1.5 px-4 text-xs font-black" style={{ color: ORANGE, background: CREAM }}><MessagesSquare size={14} />{t("dashboard.ticker")}</div>{rows.length ? <motion.div className="absolute left-28 flex h-full items-center gap-7 whitespace-nowrap px-6" animate={{ x: ["0%", "-50%"] }} transition={{ repeat: Infinity, duration: 26, ease: "linear" }}>{[...rows, ...rows].map((comment, index) => { const color = contestants.find((c) => comment.mentions.includes(c.id))?.accentColor ?? ORANGE; return <span key={`${comment.id}-${index}`} className="flex items-center gap-1.5 text-sm"><span className="font-semibold" style={{ color: "#4A4A4F" }}>{comment.displayName}:</span><span className="font-bold" style={{ color }}>{comment.text}</span></span>; })}</motion.div> : <div className="flex h-full items-center px-2 text-sm font-semibold" style={{ color: "#4A4A4F" }}>{t("app.empty")}</div>}</div>;
}

function MagicLeaderboard({ kind, title, caption, contestants, series, competition, authenticated, onLogin, onTotal }: { kind: "equity" | "votes"; title: string; caption: string; contestants: ContestantSummary[]; series: SeriesMap; competition?: CompetitionResponse | null; authenticated?: boolean; onLogin?: () => void; onTotal?: (id: string, total: number) => void }) {
  const { t } = useTranslation();
  const maxVotes = Math.max(1, ...contestants.map((c) => c.votes));
  return <section className="col-span-6 rounded-2xl border-2 bg-white p-5 max-lg:col-span-1" style={{ borderColor: INK }}><div className="mb-3 flex items-center gap-2">{kind === "equity" ? <TrendingUp size={18} color={NAVY} /> : <Heart size={18} color={ORANGE} fill={ORANGE} />}<h2 className="text-lg font-extrabold">{title}</h2><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: kind === "equity" ? NAVY : ORANGE }}>{caption}</span><NavLink className="ml-auto flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[11px] font-bold" style={{ borderColor: "#0C0A0F22" }} to="/contestants">{t("dashboard.viewAll")}<ChevronRight size={13} /></NavLink></div><div className="flex flex-col">{contestants.length ? contestants.map((c, index) => <div key={c.id} className="flex items-center gap-2.5 border-b py-2 last:border-0" style={{ borderColor: "#0C0A0F12" }}><span className="w-5 text-center text-sm font-extrabold" style={{ color: index === 0 ? ORANGE : INK }}>{index + 1}</span>{kind === "equity" && <RankDelta delta={0} />}<ContestantAvatar name={c.displayName} company={`${c.company ?? c.tagline} ${c.displayName}`} avatarUrl={c.avatarUrl} color={c.accentColor} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold leading-none">{c.displayName}</div><div className="mt-0.5 text-[11px]" style={{ color: "#4A4A4F" }}>{c.company ?? c.tagline}</div>{kind === "votes" && <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: CREAM }}><motion.div className="h-full rounded-full" style={{ background: c.accentColor }} initial={{ width: 0 }} animate={{ width: `${(c.votes / maxVotes) * 100}%` }} transition={{ duration: 0.6 }} /></div>}</div><Sparkline pts={series[c.id]?.map((p) => p.value) ?? [kind === "equity" ? c.equity : c.votes]} color={c.accentColor} />{kind === "equity" ? <div className="w-20 text-right"><div className="text-sm font-bold leading-none">{formatMoney(c.equity)}</div><div className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] font-semibold" style={{ color: c.returnPct >= 0 ? GREEN : RED }}>{c.returnPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{formatPct(c.returnPct)}</div></div> : <><span className="w-12 text-right text-sm font-bold tabular-nums">{formatVotes(c.votes)}</span><VoteButton contestantId={c.id} enabled={competition?.status !== "ended" && !!competition?.votingEnabled} authenticated={!!authenticated} onLogin={onLogin ?? (() => undefined)} onTotal={(total) => onTotal?.(c.id, total)} status={competition?.status} seasonId={competition?.seasonId} compact /></>}</div>) : <LeaderboardSkeleton />}</div></section>;
}

function RankDelta({ delta }: { delta: number }) {
  if (delta > 0) return <span className="w-3.5"><ChevronUp size={15} color={GREEN} /></span>;
  if (delta < 0) return <span className="w-3.5"><ChevronDown size={15} color={RED} /></span>;
  return <span className="w-3.5"><span className="block h-0.5 w-2" style={{ background: "#4A4A4F" }} /></span>;
}

function Sparkline({ pts, color }: { pts: number[]; color: string }) {
  const safe = pts.length > 1 ? pts : [pts[0] ?? 0, pts[0] ?? 0];
  const width = 120;
  const height = 42;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const line = safe.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (safe.length - 1)) * width} ${4 + (1 - (v - min) / span) * (height - 8)}`).join(" ");
  return <svg width={width} height={height} className="block"><path d={line} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" /><circle cx={width} cy={4 + (1 - (safe[safe.length - 1] - min) / span) * (height - 8)} r={2.5} fill={color} /></svg>;
}

function LeaderboardSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg" style={{ background: "#0C0A0F0B" }} />)}</div>;
}

type SeriesMap = Record<string, Array<{ t: number; value: number }>>;
type ChartRow = { id: string; name: string; color: string; points: number[] };

function chartContestants(contestants: ContestantSummary[], series: SeriesMap, selectedIds: string[], metric: ChartMetric, topN: number): ChartRow[] {
  const ranked = selectedIds.length ? contestants.filter((c) => selectedIds.includes(c.id)) : [...contestants].sort((a, b) => metric === "votes" ? b.votes - a.votes : a.rank - b.rank).slice(0, topN);
  return ranked.map((c) => ({ id: c.id, name: c.displayName, color: c.accentColor, points: normalizePoints(series[c.id]?.map((p) => p.value), metric === "equity" ? c.equity : c.votes) }));
}

function toSeriesMap(raw: Record<string, Array<{ t: number; equity?: number; count?: number }>>): SeriesMap {
  return Object.fromEntries(Object.entries(raw).map(([id, points]) => [
    id,
    points.map((point) => ({ t: point.t, value: point.equity ?? point.count ?? 0 })),
  ]));
}

function normalizePoints(points: number[] | undefined, fallback: number) {
  if (points && points.length > 1) return points;
  return [fallback, fallback];
}

function parseIds(raw: string | null) {
  return raw?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
}

function defaultSeriesIds(contestants: ContestantSummary[], metric: ChartMetric, topN: number) {
  if (metric === "votes") {
    if (topN === 8) return [];
    return [...contestants].sort((a, b) => b.votes - a.votes).slice(0, topN).map((c) => c.id);
  }
  return [...contestants].sort((a, b) => a.rank - b.rank).slice(0, topN).map((c) => c.id);
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVotes(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
