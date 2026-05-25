export type RangeKey = "12h" | "1d" | "2d" | "3d";
export type RangeMode = RangeKey | "all" | "max";

const RANGES: Record<RangeKey, number> = {
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "2d": 2 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
};

export function rangeMs(input: string | undefined | null): number {
  return RANGES[(input as RangeKey) || "1d"] ?? RANGES["1d"];
}

export function isAllRange(input: string | undefined | null): boolean {
  return input === "all" || input === "max";
}

export function resample<T>(points: T[], max = 120): T[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  return points.filter((_, index) => index % stride === 0).slice(0, max);
}

export function cumulativeBuckets(rows: Array<{ contestantId: string; bucketStart: number; count: number }>) {
  const totals: Record<string, number> = {};
  const series: Record<string, Array<{ t: number; count: number }>> = {};
  for (const row of rows) {
    totals[row.contestantId] = (totals[row.contestantId] ?? 0) + row.count;
    (series[row.contestantId] ??= []).push({ t: row.bucketStart, count: totals[row.contestantId] });
  }
  return series;
}

export function parseIds(raw: string | undefined | null): string[] | null {
  if (!raw) return null;
  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.length ? [...new Set(ids)] : null;
}

export function topIdsByMetric<T>(items: readonly T[], idOf: (item: T) => string, metricOf: (item: T) => number, limit = 8): string[] {
  return [...items].sort((a, b) => metricOf(b) - metricOf(a) || idOf(a).localeCompare(idOf(b))).slice(0, limit).map(idOf);
}
