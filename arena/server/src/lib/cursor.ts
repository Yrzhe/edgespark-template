export function encodeCursor(createdAt: number, id: number): string {
  return btoa(`${createdAt}:${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseCursor(raw: string | undefined): { createdAt: number; id: number } | null {
  if (!raw) return null;
  try {
    const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
    const [createdAt, id] = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + pad).split(":").map(Number);
    return Number.isFinite(createdAt) && Number.isFinite(id) ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

