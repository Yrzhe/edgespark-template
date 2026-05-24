import { motion, type Variants } from "framer-motion";
import { Eye, MousePointerClick, Percent, TrendingUp } from "lucide-react";

import type { DailyAnalyticsPoint, DimensionCount, Page, PageAnalytics } from "@/lib/types";

const ranges = ["7d", "30d", "90d"] as const;
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, type: "spring", stiffness: 280, damping: 26 } }),
};

export function Analytics({
  page,
  analytics,
  range,
  loading,
  error,
  onRangeChange,
}: {
  page: Page;
  analytics: PageAnalytics | null;
  range: "7d" | "30d" | "90d";
  loading?: boolean;
  error?: Error | null;
  onRangeChange: (range: "7d" | "30d" | "90d") => void;
}) {
  const totals = analytics?.totals ?? { views: 0, clicks: 0, ctr: 0 };
  const metrics = [
    { label: "Views", value: formatNumber(totals.views), delta: loading ? "loading" : "selected range", icon: Eye },
    { label: "Clicks", value: formatNumber(totals.clicks), delta: "redirect clicks", icon: MousePointerClick },
    { label: "CTR", value: `${(totals.ctr * 100).toFixed(1)}%`, delta: "clicks / views", icon: Percent },
    { label: "Top link", value: analytics?.topLinks[0]?.title ?? "None", delta: `${formatNumber(analytics?.topLinks[0]?.value ?? 0)} clicks`, icon: TrendingUp },
  ];
  const dailySeries = analytics?.dailySeries ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="text-[15px] font-semibold tracking-tight">Analytics</h2><p className="mt-0.5 font-mono text-[12px] text-zinc-400">/{page.slug}</p></div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
          {ranges.map((value) => <button key={value} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${value === range ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"}`} onClick={() => onRangeChange(value)}>{value}</button>)}
        </div>
      </div>
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return <motion.div key={m.label} custom={i} variants={item} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between text-zinc-400"><span className="text-[12.5px] font-medium uppercase tracking-wide">{m.label}</span><Icon className="h-4 w-4" /></div><div className="mt-2 truncate text-[26px] font-semibold tracking-tight">{m.value}</div><div className="mt-0.5 text-[12px] text-zinc-500">{m.delta}</div></motion.div>;
        })}
      </div>
      <motion.div custom={4} variants={item} initial="hidden" animate="show" className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between"><span className="text-[14px] font-medium">Views over time</span><span className="text-[12px] text-zinc-400">{dailySeries.length ? `${dailySeries[0]?.day} to ${dailySeries[dailySeries.length - 1]?.day}` : "no series yet"}</span></div>
        <div className="mt-3"><AreaChart data={dailySeries} /></div>
      </motion.div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        <motion.div custom={5} variants={item} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-[14px] font-medium">Top links</span>
          <div className="mt-3 flex flex-col">
            {(analytics?.topLinks ?? []).map((link, i) => <div key={`${link.linkId ?? "unknown"}-${i}`} className="flex items-center gap-3 border-b border-zinc-50 py-2.5 text-[13.5px]"><span className="w-5 font-mono text-zinc-400">{i + 1}</span><span className="flex-1 truncate text-zinc-800">{link.title ?? "Unknown"}</span><span className="w-16 text-right font-medium text-zinc-900">{formatNumber(link.value)}</span></div>)}
            {(!analytics || analytics.topLinks.length === 0) && <div className="py-4 text-[13px] text-zinc-400">No click data yet.</div>}
          </div>
        </motion.div>
        <motion.div custom={6} variants={item} initial="hidden" animate="show" className="flex flex-col gap-3">
          <Breakdown title="Referrers" rows={analytics?.referrers ?? []} />
          <Breakdown title="Devices" rows={analytics?.devices ?? []} />
          <Breakdown title="Countries" rows={analytics?.countries ?? []} />
        </motion.div>
      </div>
    </div>
  );
}

function AreaChart({ data }: { data: DailyAnalyticsPoint[] }) {
  const points = data.length ? data : [{ day: "none", views: 0, clicks: 0 }];
  const w = 760;
  const h = 200;
  const max = Math.max(...points.flatMap((point) => [point.views, point.clicks]), 1);
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const viewPts = points.map((point, i) => [points.length > 1 ? i * stepX : w / 2, yFor(point.views, max, h)] as const);
  const clickPts = points.map((point, i) => [points.length > 1 ? i * stepX : w / 2, yFor(point.clicks, max, h)] as const);
  const viewLine = linePath(viewPts);
  const clickLine = linePath(clickPts);
  const area = `${viewLine} L${viewPts[viewPts.length - 1]?.[0] ?? w},${h} L${viewPts[0]?.[0] ?? 0},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((mark) => <line key={mark} x1="0" y1={h * mark} x2={w} y2={h * mark} stroke="#f4f4f5" strokeWidth="1" />)}
      <path d={area} fill="#18181b" opacity="0.06" />
      <motion.path d={clickLine} fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} />
      <motion.path d={viewLine} fill="none" stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
    </svg>
  );
}
function Breakdown({ title, rows }: { title: string; rows: DimensionCount[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4"><span className="text-[13px] font-medium">{title}</span><div className="mt-2.5 flex flex-col gap-2">{rows.length === 0 ? <span className="text-[12.5px] text-zinc-400">No data</span> : rows.slice(0, 4).map((row) => <div key={row.value}><div className="flex items-center justify-between text-[12.5px]"><span className="text-zinc-600">{row.value}</span><span className="text-zinc-400">{row.count}</span></div><div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"><motion.div className="h-full rounded-full bg-zinc-900" initial={{ width: 0 }} animate={{ width: `${(row.count / max) * 100}%` }} /></div></div>)}</div></div>;
}
function formatNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
function yFor(value: number, max: number, height: number): number {
  return height - (value / max) * (height - 16) - 8;
}
function linePath(points: readonly (readonly [number, number])[]): string {
  return points.map((point, i) => `${i === 0 ? "M" : "L"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
}
