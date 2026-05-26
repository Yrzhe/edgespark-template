import type { themes, bioBlurbs, projects, socials } from "@defs";
import { sanitizeColor, sanitizeFontFamily } from "../themeValidation";

export type PublicContent = {
  bioBlurbs: Array<typeof bioBlurbs.$inferSelect>;
  projects: Array<typeof projects.$inferSelect & { imageUrl?: string | null }>;
  socials: Array<typeof socials.$inferSelect>;
};

export type FallbackCopy = {
  headline?: string;
  intro?: string;
  cta?: string;
  signoff?: string;
};

type Theme = typeof themes.$inferSelect;

export function renderLayout(theme: Theme, content: PublicContent, blocks: Record<string, string> = {}): string {
  const copy = fallbackCopy(theme);
  const layout = theme.layoutKey;
  if (layout === "terminal") return terminal(copy, content, blocks);
  if (layout === "magazine") return magazine(copy, content, blocks);
  if (layout === "gallery") return gallery(copy, content, blocks);
  return letter(copy, content, blocks);
}

export function themeCss(theme: Theme): string {
  const palette = safeJson<Record<string, string>>(theme.paletteJson, defaultPalette(theme.layoutKey));
  const font = safeJson<Record<string, string>>(theme.fontJson, defaultFonts(theme.layoutKey));
  return `:root{--bg:${sanitizeColor(palette.bg ?? palette.background, "#FBFAF6")};--fg:${sanitizeColor(palette.fg ?? palette.foreground, "#1A1715")};--accent:${sanitizeColor(palette.accent, "#2556B6")};--border:${sanitizeColor(palette.border, "rgba(0,0,0,.18)")};--body:${sanitizeFontFamily(font.body, "system-ui")};--heading:${sanitizeFontFamily(font.heading ?? font.body, "serif")}}`;
}

function terminal(copy: FallbackCopy, content: PublicContent, blocks: Record<string, string>): string {
  return `<main class="layout terminal"><p class="kicker">$ whoami</p><h1 data-block-id="hero-headline">${text(blocks, "hero-headline", copy.headline ?? firstBioTitle(content))}</h1><p data-block-id="hero-intro">${text(blocks, "hero-intro", copy.intro ?? firstBioBody(content))}</p><p data-block-id="about-body">${text(blocks, "about-body", firstBioBody(content))}</p>${projectList(content, blocks)}${socialList(content)}<p class="cta">${esc(copy.cta ?? "Open to thoughtful conversations.")}</p></main>`;
}

function magazine(copy: FallbackCopy, content: PublicContent, blocks: Record<string, string>): string {
  return `<main class="layout magazine"><h1 data-block-id="hero-headline">${text(blocks, "hero-headline", copy.headline ?? firstBioTitle(content))}</h1><section class="lede" data-block-id="hero-deck">${text(blocks, "hero-deck", copy.intro ?? firstBioBody(content))}</section><p data-block-id="body-p1">${text(blocks, "body-p1", firstBioBody(content))}</p>${projectList(content, blocks)}<p data-block-id="contact-note">${text(blocks, "contact-note", copy.cta ?? "Open to thoughtful conversations.")}</p>${socialList(content)}</main>`;
}

function gallery(copy: FallbackCopy, content: PublicContent, blocks: Record<string, string>): string {
  return `<main class="layout gallery"><h1 data-block-id="hero-name">${text(blocks, "hero-name", copy.headline ?? firstBioTitle(content))}</h1><p data-block-id="hero-intro">${text(blocks, "hero-intro", copy.intro ?? firstBioBody(content))}</p><p data-block-id="about-short">${text(blocks, "about-short", firstBioBody(content))}</p><div class="grid">${content.projects.map((p) => `<article>${p.imageUrl ? `<img src="${escAttr(p.imageUrl)}" alt="${escAttr(p.title)}">` : ""}<h2 data-block-id="project-${escAttr(p.id)}-title">${text(blocks, `project-${p.id}-title`, p.title)}</h2><p data-block-id="project-${escAttr(p.id)}-blurb">${text(blocks, `project-${p.id}-blurb`, p.description)}</p></article>`).join("")}</div>${socialList(content)}</main>`;
}

function letter(copy: FallbackCopy, content: PublicContent, blocks: Record<string, string>): string {
  return `<main class="layout letter"><h1 data-block-id="hero-greeting">${text(blocks, "hero-greeting", copy.headline ?? firstBioTitle(content))}</h1><p data-block-id="hero-intro">${text(blocks, "hero-intro", copy.intro ?? firstBioBody(content))}</p><p data-block-id="about-body">${text(blocks, "about-body", firstBioBody(content))}</p>${projectList(content, blocks)}<p class="signoff" data-block-id="sign-off-line">${text(blocks, "sign-off-line", copy.signoff ?? "Warmly")}</p>${socialList(content)}</main>`;
}

function projectList(content: PublicContent, blocks: Record<string, string>): string {
  if (!content.projects.length) return "";
  return `<section class="projects">${content.projects.map((p) => `<article><h2>${esc(p.title)}</h2><p data-block-id="project-${escAttr(p.id)}">${text(blocks, `project-${p.id}`, p.description)}</p>${p.url ? `<a href="${escAttr(p.url)}" rel="me noopener">View</a>` : ""}</article>`).join("")}</section>`;
}

function socialList(content: PublicContent): string {
  if (!content.socials.length) return "";
  return `<nav>${content.socials.map((s) => `<a href="${escAttr(s.url)}" rel="me noopener">${esc(s.label)}</a>`).join("")}</nav>`;
}

function firstBioTitle(content: PublicContent): string {
  return content.bioBlurbs[0]?.title ?? "Personal site";
}

function firstBioBody(content: PublicContent): string {
  return content.bioBlurbs[0]?.body ?? "A small, adaptive home for current work, notes, and ways to connect.";
}

function fallbackCopy(theme: Theme): FallbackCopy {
  return safeJson(theme.fallbackCopyJson, {});
}

function defaultPalette(layout: string): Record<string, string> {
  if (layout === "terminal") return { bg: "#0C0A0F", fg: "#EDEAE3", accent: "#7DDC8B" };
  if (layout === "magazine") return { bg: "#F7F5F1", fg: "#0C0A0F", accent: "#BC4E32" };
  if (layout === "gallery") return { bg: "#F7F5F1", fg: "#0C0A0F", accent: "#F36440", border: "#2556B6" };
  return { bg: "#FBFAF6", fg: "#1A1715", accent: "#2556B6" };
}

function defaultFonts(layout: string): Record<string, string> {
  if (layout === "terminal") return { body: "IBM Plex Mono, monospace", heading: "JetBrains Mono, monospace" };
  if (layout === "magazine") return { body: "Source Serif 4, serif", heading: "Fraunces, serif" };
  if (layout === "gallery") return { body: "Inter, sans-serif", heading: "Gaegu, sans-serif" };
  return { body: "Crimson Pro, serif", heading: "Crimson Pro, serif" };
}

function safeJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}

function text(blocks: Record<string, string>, key: string, fallback: string): string {
  return esc(blocks[key] ?? fallback);
}
