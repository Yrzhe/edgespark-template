import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { palettes } from "@defs";

export const BLOOME_CANONICAL_PALETTE_ID = "pal_bloome_canonical";

export const BLOOME_CANONICAL_COLORS = [
  { name: "Bloome Navy", hex: "#2556B6", role: "primary" },
  { name: "Bloome Orange", hex: "#F36440", role: "accent" },
  { name: "Bloome Dark Orange", hex: "#BC4E32", role: "emphasis" },
  { name: "Ink Black", hex: "#0C0A0F", role: "text" },
  { name: "Cream", hex: "#F7F5F1", role: "secondary-bg" },
  { name: "Pure White", hex: "#FFFFFF", role: "content-bg" },
];

export type PaletteColor = typeof BLOOME_CANONICAL_COLORS[number];
export type PaletteRow = { id: string; name: string; kind: string; locked: number; colorsJson: string; deletedAt?: number | null };

export function canonicalPaletteRow(now = Date.now()) {
  return {
    id: BLOOME_CANONICAL_PALETTE_ID,
    name: "Bloome canonical",
    kind: "canonical",
    locked: 1,
    colorsJson: JSON.stringify(BLOOME_CANONICAL_COLORS),
    ownerId: "system",
    createdAt: now,
    updatedAt: now,
    lockVersion: 0,
  };
}

export async function ensureCanonicalPalette(database = db): Promise<PaletteRow> {
  const [existing] = await database.select().from(palettes).where(eq(palettes.id, BLOOME_CANONICAL_PALETTE_ID)).limit(1);
  if (existing && !existing.deletedAt) return existing;
  const row = canonicalPaletteRow();
  await database.insert(palettes).values(row);
  return row;
}

export async function resolveActivePalette(options: { explicitPaletteId?: string | null; sessionDefaultPaletteId?: string | null } = {}, database = db): Promise<PaletteRow> {
  const id = options.explicitPaletteId ?? options.sessionDefaultPaletteId ?? BLOOME_CANONICAL_PALETTE_ID;
  const [row] = await database.select().from(palettes).where(eq(palettes.id, id)).limit(1);
  if (row && !row.deletedAt) return row;
  return ensureCanonicalPalette(database);
}

export function parsePaletteColors(row: Pick<PaletteRow, "colorsJson">): PaletteColor[] {
  try {
    const parsed = JSON.parse(row.colorsJson);
    return Array.isArray(parsed) ? parsed.filter(isPaletteColor) : BLOOME_CANONICAL_COLORS;
  } catch {
    return BLOOME_CANONICAL_COLORS;
  }
}

function isPaletteColor(value: unknown): value is PaletteColor {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string" && typeof (value as { hex?: unknown }).hex === "string" && typeof (value as { role?: unknown }).role === "string";
}
