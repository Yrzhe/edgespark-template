const APPROVED_FONTS = new Set([
  "IBM Plex Mono",
  "JetBrains Mono",
  "Source Serif 4",
  "Fraunces",
  "Inter",
  "Gaegu",
  "Crimson Pro",
  "Caveat",
  "system-ui",
  "serif",
  "sans-serif",
  "monospace",
]);

export function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const s = value.trim();
  if (isHexColor(s) || isFunctionalColor(s)) return s;
  return fallback;
}

export function sanitizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const tokens = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!tokens.length) return fallback;
  const cleaned: string[] = [];
  for (const token of tokens) {
    const unquoted = token.replace(/^['"]|['"]$/g, "");
    if (!APPROVED_FONTS.has(unquoted)) return fallback;
    cleaned.push(quoteFont(unquoted));
  }
  return cleaned.join(", ");
}

export function validatePalette(value: unknown): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "palette must be an object." };
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!["bg", "background", "fg", "foreground", "accent", "border"].includes(key)) continue;
    if (typeof raw !== "string" || sanitizeColor(raw, "") === "") return { ok: false, message: `palette.${key} must be a safe color.` };
    out[key] = raw.trim();
  }
  return { ok: true, value: out };
}

export function validateFonts(value: unknown): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "font must be an object." };
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!["body", "heading"].includes(key)) continue;
    const sanitized = sanitizeFontFamily(raw, "");
    if (!sanitized) return { ok: false, message: `font.${key} must use approved font tokens.` };
    out[key] = sanitized;
  }
  return { ok: true, value: out };
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value);
}

function isFunctionalColor(value: string): boolean {
  const match = /^(rgb|rgba|hsl|hsla)\((.*)\)$/i.exec(value);
  if (!match) return false;
  const fn = match[1].toLowerCase();
  const parts = match[2].split(",").map((part) => part.trim());
  if ((fn === "rgb" || fn === "hsl") && parts.length !== 3) return false;
  if ((fn === "rgba" || fn === "hsla") && parts.length !== 4) return false;
  if (fn.startsWith("rgb")) {
    const [r, g, b, a] = parts;
    return [r, g, b].every(isRgbChannel) && (a === undefined || isAlpha(a));
  }
  const [h, s, l, a] = parts;
  return isHue(h) && isPercent(s) && isPercent(l) && (a === undefined || isAlpha(a));
}

function isRgbChannel(value: string): boolean {
  if (value.endsWith("%")) return isPercent(value);
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 255;
}

function isHue(value: string): boolean {
  const n = Number(value.replace(/deg$/i, ""));
  return Number.isFinite(n) && n >= 0 && n <= 360;
}

function isPercent(value: string): boolean {
  if (!value.endsWith("%")) return false;
  const n = Number(value.slice(0, -1));
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function isAlpha(value: string): boolean {
  if (value.endsWith("%")) return isPercent(value);
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function quoteFont(value: string): string {
  return /^[a-z-]+$/i.test(value) ? value : `"${value}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
