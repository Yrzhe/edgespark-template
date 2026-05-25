export function clampCount(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : 1;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(25, Math.floor(n)));
}

