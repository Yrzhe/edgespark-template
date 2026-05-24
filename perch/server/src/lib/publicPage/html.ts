export type PublicPage = {
  slug: string;
  title: string;
  displayName: string;
  bio: string | null;
  avatarS3Uri: string | null;
  coverS3Uri: string | null;
  socialLinksJson: string;
};

export type PublicLink = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  thumbnailS3Uri: string | null;
  position: number;
  isActive: number;
  isFeatured: number;
  linkKind: string;
};

export type PublicTheme = {
  background?: string;
  foreground?: string;
  muted?: string;
  card?: string;
  accent?: string;
  radius?: string;
  fontFamily?: string;
  footerText?: string;
};

export type PublicImageUrls = {
  avatar?: string | null;
  cover?: string | null;
  thumbnails?: Record<string, string | null>;
};

type SocialLink = {
  platform?: string;
  label?: string;
  url?: string;
};

const DEFAULT_THEME = {
  pageBg: "#fafafa",
  card: "#ffffff",
  foreground: "#18181b",
  muted: "#71717a",
  soft: "#e4e4e7",
  subtle: "#f4f4f5",
  accent: "#18181b",
  radius: "28px",
};

export function renderPublicPage(
  page: PublicPage,
  links: readonly PublicLink[],
  theme: PublicTheme,
  imageUrls: PublicImageUrls
): string {
  const activeLinks = links
    .filter((link) => link.isActive === 1)
    .slice()
    .sort((a, b) => a.position - b.position);
  const featured = activeLinks.find((link) => link.isFeatured === 1 && link.linkKind !== "section") ?? null;
  const normalLinks = featured ? activeLinks.filter((link) => link.id !== featured.id) : activeLinks;
  const socialLinks = parseSocialLinks(page.socialLinksJson);
  const title = page.title || page.displayName;
  const description = page.bio || `${page.displayName}'s links`;
  const ogImage = imageUrls.cover || imageUrls.avatar || "";
  const handle = `@${page.slug}`;
  const initials = initialsFor(page.displayName);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ""}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
  <style>
    :root {
      --page-bg: ${safeCssColor(theme.background, DEFAULT_THEME.pageBg)};
      --card: ${safeCssColor(theme.card, DEFAULT_THEME.card)};
      --fg: ${safeCssColor(theme.foreground, DEFAULT_THEME.foreground)};
      --muted: ${safeCssColor(theme.muted, DEFAULT_THEME.muted)};
      --soft: ${DEFAULT_THEME.soft};
      --subtle: ${DEFAULT_THEME.subtle};
      --accent: ${safeCssColor(theme.accent, DEFAULT_THEME.accent)};
      --radius: ${safeCssLength(theme.radius, DEFAULT_THEME.radius)};
      --font: ${safeFont(theme.fontFamily)};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font);
      color: var(--fg);
      background: #fff;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    a { color: inherit; }
    .page { min-height: 100vh; width: 100%; background: #fff; }
    .wrap { display: flex; justify-content: center; }
    .card { width: 100%; max-width: 460px; padding: 36px 20px; background: var(--card); }
    .profile { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .avatar {
      display: grid; place-items: center; width: 80px; height: 80px; border-radius: 999px;
      background: var(--fg); color: #fff; font-size: 20px; font-weight: 650; letter-spacing: 0;
    }
    h1 { margin: 16px 0 0; display: flex; align-items: center; gap: 6px; font-size: 22px; line-height: 1.15; font-weight: 650; letter-spacing: 0; }
    .verified { display: inline-flex; width: 18px; height: 18px; color: var(--fg); }
    .handle { margin: 3px 0 0; color: #a1a1aa; font-size: 14px; }
    .bio { margin: 12px 0 0; max-width: 320px; color: #52525b; font-size: 14px; line-height: 1.65; }
    .socials { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
    .social {
      display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--soft);
      border-radius: 999px; color: #52525b; text-decoration: none; transition: border-color .18s ease, background .18s ease, color .18s ease, transform .18s ease;
    }
    .social:hover { transform: translateY(-2px); border-color: var(--fg); background: var(--fg); color: #fff; }
    .icon { width: 16px; height: 16px; display: block; }
    .icon-x { width: 15px; height: 15px; }
    .section-head { margin: 32px 0 12px; display: flex; align-items: center; gap: 12px; }
    .section-head span:first-child { color: #a1a1aa; font-size: 11px; font-weight: 650; letter-spacing: .18em; text-transform: uppercase; }
    .section-head .line { height: 1px; flex: 1; background: var(--soft); }
    .featured {
      display: block; overflow: hidden; border: 1px solid var(--soft); border-radius: 16px; background: #fff;
      text-decoration: none; transition: border-color .18s ease, transform .18s ease;
    }
    .featured:hover { transform: translateY(-2px); border-color: var(--fg); }
    .motif, .featured-cover { position: relative; height: 112px; overflow: hidden; border-bottom: 1px solid var(--soft); background: var(--subtle); }
    .motif::before {
      content: ""; position: absolute; inset: 0; opacity: .5;
      background-image: repeating-linear-gradient(135deg, #e4e4e7 0 1px, transparent 1px 13px);
    }
    .featured-cover img { width: 100%; height: 100%; display: block; object-fit: cover; }
    .featured-cover::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.16));
    }
    .eyebrow {
      position: absolute; left: 16px; top: 16px; border: 1px solid #d4d4d8; border-radius: 999px;
      background: rgba(255,255,255,.8); padding: 5px 10px; color: #71717a;
      font-size: 10px; line-height: 1; font-weight: 650; letter-spacing: .14em; text-transform: uppercase;
    }
    .featured-body { padding: 16px; }
    .featured-title { margin: 0; color: var(--fg); font-size: 16px; line-height: 1.35; font-weight: 650; letter-spacing: 0; }
    .featured-desc { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .featured-cta { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; color: var(--fg); font-size: 13px; font-weight: 550; }
    .rows { display: flex; flex-direction: column; gap: 10px; }
    .row {
      display: flex; align-items: center; gap: 14px; border: 1px solid var(--soft); border-radius: 16px;
      background: #fff; padding: 13px 14px; text-decoration: none; transition: border-color .18s ease, transform .18s ease;
    }
    .row:hover { transform: translateY(-2px); border-color: var(--fg); }
    .row-thumb {
      width: 42px; height: 42px; flex: 0 0 42px; overflow: hidden; border: 1px solid var(--soft); border-radius: 12px;
      display: grid; place-items: center; background: var(--subtle); color: #71717a; font-size: 13px; font-weight: 650;
    }
    .row-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; }
    .row-main { min-width: 0; flex: 1; }
    .row-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); font-size: 15px; font-weight: 550; }
    .row-desc { display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; }
    .arrow { width: 18px; height: 18px; flex: 0 0 auto; color: #d4d4d8; }
    .subsection { margin: 24px 0 10px; color: #a1a1aa; font-size: 11px; font-weight: 650; letter-spacing: .18em; text-transform: uppercase; }
    .footer { margin-top: 40px; border-top: 1px solid #f4f4f5; padding-top: 24px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .footer a { color: #a1a1aa; text-decoration: none; font-size: 12px; transition: color .18s ease; }
    .footer a:hover { color: var(--fg); }
    .footer strong { color: #71717a; font-weight: 650; }
    .author { display: inline-flex; align-items: center; gap: 6px; }
    .author svg { width: 12px; height: 12px; }
    @media (min-width: 768px) {
      body { background: var(--page-bg); }
      .page { background: var(--page-bg); }
      .wrap { align-items: flex-start; padding: 48px 0; }
      .card { border: 1px solid var(--soft); border-radius: var(--radius); padding: 44px 32px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.08); }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="wrap">
      <main class="card">
        <section class="profile">
          <div class="avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <h1>${escapeHtml(page.displayName)} <span class="verified" aria-label="Verified">${verifiedIcon()}</span></h1>
          <p class="handle">${escapeHtml(handle)}</p>
          ${page.bio ? `<p class="bio">${escapeHtml(page.bio)}</p>` : ""}
          ${renderSocials(socialLinks)}
        </section>
        ${featured ? `${sectionHeader("Featured")}${renderFeatured(featured, page.slug, thumbnailUrlFor(featured, imageUrls))}` : ""}
        ${normalLinks.length > 0 ? `${sectionHeader("Links")}${renderLinkList(normalLinks, page.slug, imageUrls)}` : ""}
        ${renderFooter()}
      </main>
    </div>
  </div>
</body>
</html>`;
}

function sectionHeader(label: string): string {
  return `<div class="section-head"><span>${escapeHtml(label)}</span><span class="line" aria-hidden="true"></span></div>`;
}

function renderSocials(socialLinks: readonly SocialLink[]): string {
  if (socialLinks.length === 0) return "";
  return `<nav class="socials" aria-label="Social links">${socialLinks
    .map((item) => {
      const label = item.label || item.platform || "Link";
      return `<a class="social" href="${escapeAttr(item.url || "#")}" aria-label="${escapeAttr(label)}" rel="me noopener noreferrer">${socialIcon(item)}</a>`;
    })
    .join("")}</nav>`;
}

function renderFeatured(link: PublicLink, pageSlug: string, thumbnailUrl: string | null): string {
  return `<a class="featured" href="${clickHref(link, pageSlug)}">
    ${thumbnailUrl
      ? `<div class="featured-cover"><img src="${escapeAttr(thumbnailUrl)}" alt="" loading="lazy" decoding="async"><span class="eyebrow">Featured</span></div>`
      : `<div class="motif"><span class="eyebrow">Featured</span></div>`}
    <div class="featured-body">
      <h2 class="featured-title">${escapeHtml(link.title)}</h2>
      ${link.description ? `<p class="featured-desc">${escapeHtml(link.description)}</p>` : ""}
      <span class="featured-cta">Open ${arrowRightIcon()}</span>
    </div>
  </a>`;
}

function renderLinkList(links: readonly PublicLink[], pageSlug: string, imageUrls: PublicImageUrls): string {
  const parts: string[] = [];
  let rows: string[] = [];
  const flushRows = () => {
    if (rows.length > 0) {
      parts.push(`<div class="rows">${rows.join("\n")}</div>`);
      rows = [];
    }
  };

  for (const link of links) {
    if (link.linkKind === "section") {
      flushRows();
      parts.push(`<h2 class="subsection">${escapeHtml(link.title)}</h2>`);
    } else {
      rows.push(renderLink(link, pageSlug, thumbnailUrlFor(link, imageUrls)));
    }
  }
  flushRows();
  return parts.join("\n");
}

function renderLink(link: PublicLink, pageSlug: string, thumbnailUrl: string | null): string {
  return `<a class="row" href="${clickHref(link, pageSlug)}">
    ${renderLinkThumbnail(link, thumbnailUrl)}
    <span class="row-main"><span class="row-title">${escapeHtml(link.title)}</span>${link.description ? `<span class="row-desc">${escapeHtml(link.description)}</span>` : ""}</span>
    ${arrowUpRightIcon()}
  </a>`;
}

function renderLinkThumbnail(link: PublicLink, thumbnailUrl: string | null): string {
  if (thumbnailUrl) {
    return `<span class="row-thumb"><img src="${escapeAttr(thumbnailUrl)}" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="row-thumb" aria-hidden="true">${escapeHtml(initialsFor(link.title))}</span>`;
}

function thumbnailUrlFor(link: PublicLink, imageUrls: PublicImageUrls): string | null {
  if (!link.thumbnailS3Uri) return null;
  return imageUrls.thumbnails?.[link.id] ?? null;
}

function renderFooter(): string {
  return `<footer class="footer">
    <a href="https://github.com/Yrzhe/edgespark-template">Built with <strong>Perch</strong></a>
    <a class="author" href="https://x.com/yrzhe_top">${xLogo("icon-x")}<span>@yrzhe_top</span></a>
  </footer>`;
}

function clickHref(link: PublicLink, pageSlug: string): string {
  return `/api/public/p/${encodeURIComponent(pageSlug)}/l/${encodeURIComponent(link.id)}`;
}

function parseSocialLinks(raw: string): SocialLink[] {
  try {
    return normalizeSocialLinks(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is SocialLink => {
      if (!item || typeof item !== "object") return false;
      const link = item as SocialLink;
      return typeof link.url === "string" && isAllowedSocialUrl(link.url);
    })
    .slice(0, 12)
    .map((item) => ({
      platform: cleanShortText(item.platform, 40),
      label: cleanShortText(item.label, 80),
      url: item.url,
    }));
}

function socialIcon(item: SocialLink): string {
  const key = socialKey(item);
  if (key === "instagram") return instagramIcon();
  if (key === "youtube") return youtubeIcon();
  if (key === "github") return githubIcon();
  if (key === "mail") return mailIcon();
  return xLogo("icon-x");
}

function socialKey(item: SocialLink): "x" | "instagram" | "youtube" | "github" | "mail" {
  const raw = `${item.platform ?? ""} ${item.label ?? ""} ${item.url ?? ""}`.toLowerCase();
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("youtube") || raw.includes("youtu.be")) return "youtube";
  if (raw.includes("github")) return "github";
  if (raw.includes("mailto:") || raw.includes("email") || raw.includes("mail")) return "mail";
  return "x";
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).map((word) => word.match(/[a-z0-9]/i)?.[0]).filter((char): char is string => Boolean(char));
  const chars = words.length >= 2 ? [words[0], words[1]] : [words[0] ?? "P"];
  return chars.join("").toUpperCase();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function safeCssColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) return trimmed;
  if (isStrictRgb(trimmed)) return trimmed;
  return fallback;
}

function safeCssLength(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{1,3}px$/.test(value)) return fallback;
  return value;
}

function safeFont(value: string | undefined): string {
  if (!value || !/^[a-zA-Z0-9 ,"'-]+$/.test(value)) return "Inter, ui-sans-serif, system-ui, sans-serif";
  return `${value}, ui-sans-serif, system-ui, sans-serif`;
}

function isStrictRgb(value: string): boolean {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return false;
  const parts = match[1].split(",").map((part) => part.trim());
  const expectsAlpha = value.startsWith("rgba(");
  if ((!expectsAlpha && parts.length !== 3) || (expectsAlpha && parts.length !== 4)) return false;
  const channels = parts.slice(0, 3).map(Number);
  if (channels.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (parts.length === 4) {
    const alpha = Number(parts[3]);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return false;
  }
  return true;
}

function isAllowedSocialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function cleanShortText(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function xLogo(className: string): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;
}

function instagramIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1"/></svg>`;
}

function youtubeIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8.2a3 3 0 0 0-2.1-2.1C17 5.6 12 5.6 12 5.6s-5 0-6.9.5A3 3 0 0 0 3 8.2 31 31 0 0 0 2.5 12 31 31 0 0 0 3 15.8a3 3 0 0 0 2.1 2.1c1.9.5 6.9.5 6.9.5s5 0 6.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-3.8 31 31 0 0 0-.5-3.8Z"/><path d="m10 15 5-3-5-3v6Z" fill="currentColor" stroke="none"/></svg>`;
}

function githubIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.34-3.8-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 .1 2.63.06 3.27-.8.1-.72.39-1.2.7-1.48-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.7 10.7 0 0 1 5.62 0c2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.04.76 2.1v3.1c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>`;
}

function mailIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>`;
}

function verifiedIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-5"/><path d="M12 2.8 14.1 5l3-.3.7 2.9 2.6 1.5-1.3 2.8 1.3 2.8-2.6 1.5-.7 2.9-3-.3-2.1 2.2-2.1-2.2-3 .3-.7-2.9-2.6-1.5 1.3-2.8-1.3-2.8 2.6-1.5.7-2.9 3 .3L12 2.8Z"/></svg>`;
}

function arrowUpRightIcon(): string {
  return `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>`;
}

function arrowRightIcon(): string {
  return `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`;
}
