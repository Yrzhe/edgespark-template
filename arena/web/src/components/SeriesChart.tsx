import { useEffect, useMemo, useRef, useState } from "react";
import {
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTranslation } from "react-i18next";

import type { ChartMetric, ContestantSummary } from "@/lib/types";
import { money, number, palette } from "@/lib/format";
import { CREAM, INK } from "@/lib/constants";

type LineApi = ISeriesApi<"Line", Time>;
type TooltipRow = { name: string; color: string; value: number };

export function SeriesChart({
  contestants,
  series,
  metric,
}: {
  contestants: ContestantSummary[];
  series: Record<string, Array<{ t: number; value: number }>>;
  metric: ChartMetric;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRefs = useRef<Array<{ api: LineApi; id: string; name: string; color: string }>>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; time: string; rows: TooltipRow[] } | null>(null);

  const rows = useMemo(() => toChartRows(contestants, series), [contestants, series]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { color: "#fff" }, textColor: "#4A4A4F", fontFamily: "inherit", fontSize: 12 },
      grid: { vertLines: { color: "#0C0A0F0A" }, horzLines: { color: "#0C0A0F14" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#0C0A0F22", autoScale: true },
      timeScale: { borderColor: "#0C0A0F22", timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 9, fixLeftEdge: false, lockVisibleTimeRangeOnResize: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      localization: { priceFormatter: (value: number) => metric === "equity" ? money(value, true) : number(value) },
    });
    chartRef.current = chart;

    const onCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.point || !param.time) {
        setTooltip(null);
        return;
      }
      const nextRows = lineRefs.current.flatMap((line) => {
        const value = param.seriesData.get(line.api) as LineData<Time> | undefined;
        return value?.value === undefined ? [] : [{ name: line.name, color: line.color, value: Number(value.value) }];
      });
      setTooltip({ x: param.point.x, y: param.point.y, time: formatTime(param.time), rows: nextRows });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const resize = new ResizeObserver(() => chart.applyOptions({ autoSize: true }));
    resize.observe(host);
    return () => {
      resize.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      lineRefs.current = [];
    };
  }, [metric]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    lineRefs.current.forEach((line) => chart.removeSeries(line.api));
    lineRefs.current = rows.map((row) => {
      const line = chart.addSeries(LineSeries, {
        color: row.color,
        lineWidth: 3,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        title: row.name,
      });
      line.setData(row.data);
      return { api: line, id: row.id, name: row.name, color: row.color };
    });
    chart.timeScale().fitContent();
    setTooltip(null);
  }, [rows]);

  return (
    <div className="relative h-full min-h-[260px] w-full rounded-xl bg-white">
      <div ref={hostRef} className="h-full min-h-[260px] w-full" />
      {!rows.length && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm font-bold text-zinc-500">
          <div className="rounded-xl bg-white/85 px-4 py-2 shadow-sm">{t("dashboard.noSeries")}</div>
        </div>
      )}
      {tooltip && tooltip.rows.length > 0 && (
        <div className="pointer-events-none absolute z-10 min-w-44 rounded-xl border-2 bg-white p-2 text-xs shadow" style={{ borderColor: INK, left: Math.min(tooltip.x + 14, 520), top: Math.max(8, tooltip.y - 12) }}>
          <div className="mb-1 font-black" style={{ color: "#4A4A4F" }}>{tooltip.time}</div>
          <div className="space-y-1">
            {tooltip.rows.slice(0, 8).map((row) => <div key={row.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: row.color }} /><span className="min-w-0 flex-1 truncate font-bold">{row.name}</span><span className="font-black">{metric === "equity" ? money(row.value, true) : number(row.value)}</span></div>)}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-1 text-[10px] font-bold" style={{ background: CREAM, color: "#4A4A4F" }}>{t("dashboard.chartHint")}</div>
    </div>
  );
}

function toChartRows(contestants: ContestantSummary[], series: Record<string, Array<{ t: number; value: number }>>) {
  return Object.entries(series)
    .map(([id, points], index) => {
      const contestant = contestants.find((c) => c.id === id);
      const data = pointsToData(points);
      return data.length ? {
        id,
        name: contestant?.displayName ?? id,
        color: contestant?.accentColor ?? palette(index),
        data,
      } : null;
    })
    .filter((row): row is { id: string; name: string; color: string; data: Array<LineData<Time>> } => row !== null);
}

function pointsToData(points: Array<{ t: number; value: number }>): Array<LineData<Time>> {
  const bySecond = new Map<number, number>();
  for (const point of points) {
    if (Number.isFinite(point.t) && Number.isFinite(point.value)) bySecond.set(Math.floor(point.t / 1000), point.value);
  }
  return [...bySecond.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

function formatTime(time: Time) {
  if (typeof time === "number") return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time * 1000));
  if (typeof time === "string") return time;
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}
