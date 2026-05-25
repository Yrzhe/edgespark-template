import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, CalendarDays, ChevronDown, ChevronUp, Heart, MessageSquare, Trophy, TrendingDown, TrendingUp } from "lucide-react";

import { CommentComposer, CommentList } from "@/components/Comments";
import { ContestantAvatar } from "@/components/ContestantAvatar";
import { useShellContext } from "@/components/Shell";
import { KeyValues } from "@/components/ContestantWidgets";
import { Loading } from "@/components/ui";
import { VoteButton } from "@/components/VoteButton";
import { arenaApi } from "@/lib/api";
import { CREAM, GREEN, INK, NAVY, ORANGE, RED } from "@/lib/constants";
import { toNum } from "@/lib/format";
import type { Comment, CompetitionResponse, ContestantDetail, DailyResponse, Decision, SeriesRange } from "@/lib/types";

const profileRanges: SeriesRange[] = ["lifetime", "3d", "2d", "1d", "12h"];

export default function ContestantPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { onLogin, isAuthenticated } = useShellContext();
  const [contestant, setContestant] = useState<ContestantDetail | null>(null);
  const [competition, setCompetition] = useState<CompetitionResponse | null>(null);
  const [series, setSeries] = useState<number[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [daily, setDaily] = useState<DailyResponse["days"]>([]);
  const [equityRange, setEquityRange] = useState<SeriesRange>("lifetime");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    if (!id) return;
    const [detail, comp, equity, firstDecisions, nextComments, dailyRows] = await Promise.all([
      arenaApi.contestant(id),
      arenaApi.competition(),
      arenaApi.equitySeries(equityRange, [id]),
      arenaApi.decisions({ contestantId: id, limit: 20 }),
      arenaApi.comments({ limit: 50 }),
      arenaApi.daily(id),
    ]);
    setContestant(detail);
    setCompetition(comp);
    setSeries((equity.series[id] ?? []).map((point) => point.equity));
    setDecisions(firstDecisions.decisions);
    setCursor(firstDecisions.nextCursor);
    setComments(nextComments.comments.filter((comment) => comment.mentions.includes(id)));
    setDaily(dailyRows.days);
  }

  useEffect(() => { void load(); }, [id, equityRange]);

  async function loadMore() {
    if (!id || !cursor) return;
    const next = await arenaApi.decisions({ contestantId: id, cursor, limit: 20 });
    setDecisions((prev) => [...prev, ...next.decisions]);
    setCursor(next.nextCursor);
  }

  if (!contestant) return <Loading />;
  const color = contestant.accentColor || ORANGE;

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM, color: INK }}>
      <main className="mx-auto flex max-w-[1180px] flex-col gap-5 p-6">
        <section className="flex items-center gap-4 rounded-2xl border-2 bg-white p-5 max-sm:flex-wrap" style={{ borderColor: INK }}>
          <ContestantAvatar name={contestant.displayName} company={`${contestant.company ?? contestant.tagline} ${contestant.displayName}`} avatarUrl={contestant.avatarUrl} color={color} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold">{contestant.displayName}</h1>
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: ORANGE }}><Trophy size={12} />{t("contestant.rank", { rank: contestant.rank })}</span>
            </div>
            <div className="mt-0.5 text-sm" style={{ color: "#4A4A4F" }}>{contestant.company ?? contestant.tagline}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-extrabold">{formatMoney(contestant.equity)}</div>
            <div className="flex items-center justify-end gap-1 text-sm font-semibold" style={{ color: contestant.returnPct >= 0 ? GREEN : RED }}>{contestant.returnPct >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{formatPct(contestant.returnPct)}</div>
          </div>
        </section>

        <section className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
          <Stat label={t("contestant.totalPnl")} value={formatMoney(contestant.totalPnl)} sub={t("contestant.fromStart")} subColor={contestant.totalPnl >= 0 ? GREEN : RED} />
          <Stat label={t("contestant.sharpe")} value={String(contestant.sharpe ?? "-")} />
          <Stat label={t("contestant.winRate")} value={`${contestant.winRate ?? 0}%`} />
          <Stat label={t("contestant.votes")} value={formatVotes(contestant.votes)} />
          <Stat label={t("contestant.positions")} value={String(contestant.positions.length)} />
          <Stat label={t("contestant.return")} value={formatPct(contestant.returnPct)} subColor={contestant.returnPct >= 0 ? GREEN : RED} />
        </section>

        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <section className="col-span-2 rounded-2xl border-2 bg-white p-5 max-lg:col-span-1" style={{ borderColor: INK }}>
            <div className="mb-2 flex flex-wrap items-center gap-2"><Activity size={16} color={NAVY} /><h2 className="font-extrabold">{t("contestant.equityCurve")}</h2><div className="ml-auto flex overflow-hidden rounded-lg border-2 text-xs font-bold" style={{ borderColor: INK }}>{profileRanges.map((item) => <button key={item} onClick={() => setEquityRange(item)} className="px-2.5 py-1.5" style={{ background: equityRange === item ? INK : "#fff", color: equityRange === item ? "#fff" : INK }}>{t(`dashboard.range${rangeKey(item)}`)}</button>)}</div></div>
            <div className="overflow-x-auto"><div className="min-w-[700px]"><Curve pts={series.length ? series : [contestant.equity, contestant.equity]} color={color} /></div></div>
          </section>
          <section className="flex flex-col items-center justify-center rounded-2xl border-2 p-5 text-center" style={{ borderColor: INK, background: INK, color: CREAM }}>
            <Heart size={28} color={ORANGE} fill={ORANGE} />
            <div className="mt-2 text-3xl font-extrabold">{contestant.votes.toLocaleString()}</div>
            <div className="text-xs" style={{ color: "rgba(247,245,241,0.6)" }}>{t("contestant.votes")}</div>
            <div className="mt-4"><VoteButton contestantId={contestant.id} enabled={competition?.status !== "ended" && !!competition?.votingEnabled} authenticated={isAuthenticated} onLogin={onLogin} onTotal={(total) => setContestant({ ...contestant, votes: total })} status={competition?.status} seasonId={competition?.seasonId} /></div>
            <div className="mt-3 text-[11px]" style={{ color: "rgba(247,245,241,0.5)" }}>{t("contestant.supportHint")}</div>
          </section>
        </div>

        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}>
            <h2 className="mb-3 font-extrabold">{t("contestant.positions")}</h2>
            <div className="flex flex-col gap-2">{contestant.positions.length ? contestant.positions.map((p, index) => <div key={`${p.symbol}-${index}`} className="flex items-center gap-2 border-b py-2 last:border-0" style={{ borderColor: "#0C0A0F12" }}><span className="w-14 text-sm font-bold">{p.symbol ?? "-"}</span><span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: String(p.side).toLowerCase() === "long" ? GREEN : RED }}>{String(p.side ?? "-")}</span><span className="text-xs" style={{ color: "#4A4A4F" }}>{p.qty ?? "-"}@{p.avg_entry_price ?? "-"}</span><span className="ml-auto text-sm font-bold" style={{ color: toNum(p.unrealized_pl) >= 0 ? GREEN : RED }}>{formatMoney(toNum(p.unrealized_pl))}</span></div>) : <div className="py-6 text-center text-sm font-bold text-zinc-500">{t("contestant.noPositions")}</div>}</div>
          </section>
          <section className="col-span-2 rounded-2xl border-2 bg-white p-5 max-lg:col-span-1" style={{ borderColor: INK }}>
            <div className="mb-3 flex items-center gap-2"><MessageSquare size={16} color={ORANGE} /><h2 className="font-extrabold">{t("contestant.decisions")}</h2><span className="text-[11px]" style={{ color: "#4A4A4F" }}>{t("contestant.includesChain")}</span></div>
            <div className="flex flex-col gap-2">{decisions.map((decision) => <DecisionRow key={decision.id} decision={decision} open={!!expanded[decision.id]} onToggle={() => setExpanded((prev) => ({ ...prev, [decision.id]: !prev[decision.id] }))} />)}</div>
            {cursor && <button className="mt-4 rounded-lg border-2 px-4 py-2 text-xs font-bold" style={{ borderColor: INK }} onClick={() => void loadMore()}>{t("app.loadMore")}</button>}
          </section>
        </div>

        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}><h2 className="mb-3 font-extrabold">{t("contestant.account")}</h2><KeyValues data={contestant.account} /></section>
          <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}><h2 className="mb-3 font-extrabold">{t("contestant.metrics")}</h2><KeyValues data={contestant.metrics} /></section>
          <section className="flex h-[420px] min-h-0 flex-col rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}><h2 className="mb-3 shrink-0 font-extrabold">{t("contestant.comments")}</h2><div className="shrink-0"><CommentComposer contestants={[contestant]} defaultText={`@${contestant.id} `} enabled={competition?.status !== "ended" && !!competition?.commentsEnabled} authenticated={isAuthenticated} onLogin={onLogin} onSent={(comment) => setComments((prev) => [comment, ...prev])} status={competition?.status} /></div><div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto"><CommentList comments={comments} contestants={[contestant]} /></div></section>
        </div>
        <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}>
          <div className="mb-3 flex items-center gap-2"><CalendarDays size={16} color={ORANGE} /><h2 className="font-extrabold">{t("contestant.daily")}</h2></div>
          <DailyRows days={daily} />
        </section>
      </main>
    </div>
  );
}

function DailyRows({ days }: { days: DailyResponse["days"] }) {
  const { t } = useTranslation();
  const maxVotes = Math.max(1, ...days.map((day) => Math.abs(day.dVotes)));
  const maxEquity = Math.max(1, ...days.map((day) => Math.abs(day.dEquity)));
  if (!days.length) return <div className="py-6 text-center text-sm font-bold text-zinc-500">{t("app.empty")}</div>;
  return <div className="space-y-2">{days.map((day) => <div key={day.day} className="grid items-center gap-3 rounded-xl border p-3 text-sm md:grid-cols-[110px_1fr_1fr]" style={{ borderColor: "#0C0A0F14" }}><span className="font-black">{day.day}</span><MetricBar label={t("contestant.dailyVotes")} value={day.dVotes} max={maxVotes} color={ORANGE} format={formatVotes} /><MetricBar label={t("contestant.dailyEquity")} value={day.dEquity} max={maxEquity} color={day.dEquity >= 0 ? GREEN : RED} format={formatMoney} /></div>)}</div>;
}

function MetricBar({ label, value, max, color, format }: { label: string; value: number; max: number; color: string; format: (value: number) => string }) {
  return <div><div className="mb-1 flex items-center justify-between text-[11px] font-bold text-zinc-500"><span>{label}</span><span style={{ color }}>{value >= 0 ? "+" : ""}{format(value)}</span></div><div className="h-2 overflow-hidden rounded-full" style={{ background: "#0C0A0F0B" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%`, background: color }} /></div></div>;
}

function rangeKey(range: SeriesRange) {
  return range === "12h" ? "12h" : range === "1d" ? "1d" : range === "2d" ? "2d" : range === "3d" ? "3d" : "Lifetime";
}

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return <div className="rounded-xl border-2 bg-white p-3" style={{ borderColor: INK }}><div className="text-[11px]" style={{ color: "#4A4A4F" }}>{label}</div><div className="mt-0.5 text-lg font-extrabold leading-tight">{value}</div>{sub && <div className="text-[11px] font-semibold" style={{ color: subColor }}>{sub}</div>}</div>;
}

function Curve({ pts, color }: { pts: number[]; color: string }) {
  const width = 640;
  const height = 200;
  const pad = 24;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-[200px] w-full"><defs><linearGradient id="profile-curve" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>{[0, 0.5, 1].map((g) => <line key={g} x1={pad} x2={width - pad} y1={pad + g * (height - pad * 2)} y2={pad + g * (height - pad * 2)} stroke={INK} strokeOpacity={0.07} />)}<path d={`${line} L ${x(pts.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`} fill="url(#profile-curve)" /><motion.path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1 }} /></svg>;
}

function DecisionRow({ decision, open, onToggle }: { decision: Decision; open: boolean; onToggle: () => void }) {
  const text = decision.chainOfThought ?? decision.justification ?? decision.reasoning;
  return <div className="rounded-xl border-2" style={{ borderColor: "#0C0A0F12" }}><button onClick={onToggle} className="flex w-full items-center gap-2 p-3 text-left"><span className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: actColor(decision.action) }}>{decision.action} {decision.symbol}</span><span className="flex-1 truncate text-sm">{decision.reasoning ?? decision.justification ?? "-"}</span><span className="text-[11px]" style={{ color: "#4A4A4F" }}>{decision.confidence ?? "-"}</span>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>{text && open && <pre className="whitespace-pre-wrap px-3 pb-3 font-mono text-[12px] leading-relaxed" style={{ color: "#4A4A4F" }}>{text}</pre>}</div>;
}

function actColor(action: string) {
  const normalized = action.toUpperCase();
  return normalized === "BUY" ? GREEN : normalized === "SELL" ? RED : "#4A4A4F";
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVotes(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
