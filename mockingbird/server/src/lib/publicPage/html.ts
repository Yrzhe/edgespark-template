import type { themes } from "@defs";
import { renderLayout, themeCss, type PublicContent } from "./layouts";
import type { LlmRewrite } from "../llm/schema";

export function renderPublicPage(theme: typeof themes.$inferSelect, content: PublicContent, cacheKey: string, rewrite: LlmRewrite | null = null): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>${esc(theme.name)}</title>
<style>${baseCss()}${themeCss(theme)}</style>
</head>
<body data-theme-id="${escAttr(theme.id)}">
${renderLayout(theme, content, rewrite?.blocks ?? {})}
<script type="application/json" id="mockingbird-hydration">${esc(JSON.stringify({ cacheKey, themeId: theme.id, endpoint: "/api/public/adapt/stream" }))}</script>
</body>
</html>`;
}

export function renderPreviewPage(theme: typeof themes.$inferSelect, content: PublicContent, cacheKey: string, rewrite: LlmRewrite | null = null): string {
  return renderPublicPage(theme, content, cacheKey, rewrite)
    .replace('content="index,follow"', 'content="noindex,nofollow"')
    .replace("<body ", '<body data-preview="true" ')
    .replace(/(<body[^>]*>)/, '$1<div class="preview-watermark">PREVIEW - do not share</div>');
}

export function emergencyFallbackPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal site</title><style>${baseCss()}:root{--bg:#FBFAF6;--fg:#1A1715;--accent:#2556B6;--border:rgba(0,0,0,.18);--body:serif;--heading:serif}</style></head><body><main class="layout letter"><h1>Personal site</h1><p>This page is temporarily serving its static fallback.</p></main></body></html>`;
}

function baseCss(): string {
  return `*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);line-height:1.55}.preview-watermark{position:sticky;top:0;z-index:10;background:#111;color:#fff;text-align:center;padding:8px 12px;font:12px system-ui;letter-spacing:0}.layout{max-width:980px;margin:0 auto;padding:56px 20px}h1,h2{font-family:var(--heading);line-height:1.05}h1{font-size:clamp(2rem,7vw,5.5rem);margin:0 0 24px}a{color:var(--accent)}article{border-top:1px solid var(--border);padding:18px 0}.terminal{max-width:880px}.terminal .kicker{color:var(--accent)}.magazine{display:grid;gap:28px}.gallery .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border:2px solid var(--border)}.letter{max-width:760px}.signoff{color:var(--accent)}nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}
