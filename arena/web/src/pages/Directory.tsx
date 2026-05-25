import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, Heart, Search, TrendingDown, TrendingUp } from "lucide-react";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { CREAM, GREEN, INK, ORANGE, PER_PAGE, RED } from "@/lib/constants";
import { arenaApi } from "@/lib/api";
import type { ContestantSummary } from "@/lib/types";

export default function DirectoryPage() {
  const { t } = useTranslation();
  const [contestants, setContestants] = useState<ContestantSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rank");
  const [page, setPage] = useState(1);

  useEffect(() => { void arenaApi.contestants().then((data) => setContestants(data.contestants)); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = contestants.filter((c) => !q || `${c.id} ${c.displayName} ${c.tagline} ${c.company ?? ""}`.toLowerCase().includes(q));
    rows.sort((a, b) => sort === "votes" ? b.votes - a.votes : sort === "return" ? b.returnPct - a.returnPct : sort === "name" ? a.displayName.localeCompare(b.displayName) : a.rank - b.rank);
    return rows;
  }, [contestants, query, sort]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM, color: INK }}>
      <header className="mx-6 mt-5 flex min-h-14 flex-wrap items-center gap-3 rounded-2xl border bg-white px-5 py-3" style={{ borderColor: "#0C0A0F14" }}>
        <h1 className="text-lg font-extrabold">{t("directory.title")}</h1>
        <span className="text-sm" style={{ color: "#4A4A4F" }}>{t("directory.count", { count: filtered.length })}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex w-64 items-center gap-2 rounded-lg border-2 px-3 py-1.5" style={{ borderColor: INK }}>
            <Search size={14} />
            <input className="w-full bg-transparent text-xs font-semibold outline-none" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("directory.searchPlaceholder")} />
          </div>
          <Segment value={sort} items={[["rank", t("directory.sortRank")], ["votes", t("directory.sortVotes")], ["return", t("directory.sortReturn")], ["name", t("directory.sortName")]]} onChange={(value) => { setSort(value); setPage(1); }} />
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] p-6">
        <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {pageRows.length ? pageRows.map((c) => (
            <NavLink key={c.id} to={`/c/${c.id}`} className="flex flex-col rounded-2xl border-2 bg-white p-4 transition hover:-translate-y-0.5" style={{ borderColor: INK }}>
              <div className="flex items-center gap-2.5">
                <ContestantAvatar name={c.displayName} company={`${c.company ?? c.tagline} ${c.displayName}`} avatarUrl={c.avatarUrl} color={c.accentColor} size="md" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold leading-none">{c.displayName}</div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "#4A4A4F" }}>{c.company ?? c.tagline}</div>
                </div>
                <span className="ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold" style={{ background: CREAM }}>#{c.rank}</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div><div className="font-extrabold">{formatMoney(c.equity)}</div><div className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: c.returnPct >= 0 ? GREEN : RED }}>{c.returnPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{formatPct(c.returnPct)}</div></div>
                <Spark pts={[100, 100 + c.returnPct / 5, 100 + c.returnPct / 3, 100 + c.returnPct / 2, 100 + c.returnPct]} color={c.accentColor} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "#0C0A0F12" }}>
                <span className="flex items-center gap-1 text-sm font-bold"><Heart size={14} color={ORANGE} fill={ORANGE} />{formatVotes(c.votes)}</span>
                <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: c.accentColor }}>{t("directory.view")}</span>
              </div>
            </NavLink>
          )) : <SkeletonCards />}
        </div>
        <div className="mt-6 flex items-center justify-center gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-lg border-2 disabled:opacity-40" style={{ borderColor: INK }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={15} /></button>
          <span className="px-3 text-sm font-bold">{t("directory.page")} {page} / {maxPage}</span>
          <button className="grid h-8 w-8 place-items-center rounded-lg border-2 disabled:opacity-40" style={{ borderColor: INK }} disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}><ChevronRight size={15} /></button>
        </div>
      </main>
    </div>
  );
}

function Segment({ value, items, onChange }: { value: string; items: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div className="flex overflow-hidden rounded-lg border-2 text-xs font-bold" style={{ borderColor: INK }}>{items.map(([id, label]) => <button key={id} onClick={() => onChange(id)} className="px-3 py-1.5" style={{ background: value === id ? INK : "#fff", color: value === id ? "#fff" : INK }}>{label}</button>)}</div>;
}

function Spark({ pts, color }: { pts: number[]; color: string }) {
  const width = 100;
  const height = 30;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * width} ${height - ((v - min) / span) * height}`).join(" ");
  return <svg width={width} height={height}><path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /></svg>;
}

function SkeletonCards() {
  return <>{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border-2 bg-white" style={{ borderColor: INK }} />)}</>;
}

function formatMoney(value: number) {
  return `$${(value / 1000).toFixed(1)}k`;
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVotes(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
