# Perch 🐦

**An AI-agent-native link-in-bio with built-in analytics**, built on [EdgeSpark](https://edgespark.dev).
Perch your links in one place — and let your AI agent build and manage the page for you.

## What it does

- **Multiple link pages** per owner — each with its own slug, profile, theme, links, and analytics.
- **Rich links** — standard links, a "featured" hero card, section headers, thumbnails;
  drag to reorder, toggle to show/hide.
- **Themeable** — minimal mono default; color/button-style/font/avatar/cover, all configurable.
- **SSR public pages** at `/api/public/p/<slug>` — server-rendered for SEO + social unfurl,
  with per-page `<title>`/description/OG tags.
- **Click + view analytics** — first-party, no third-party tracker: totals, CTR, a daily
  time-series chart, top links, and referrer/device/country breakdowns.
- **Agent-native** — a Bearer-authenticated management API plus a served
  `GET /api/public/llms.txt` so an AI agent (handed an API key) can create pages, add links,
  set themes, and read analytics without touching the UI.
- **Dashboard** (`web/`) — Pages · Page editor (Links · Appearance · Preview · Analytics) ·
  Connect AI · API Keys, with an account menu (display name / avatar / password / logout).

## One-command init

```bash
edgespark init my-perch --agent claude --template github:Yrzhe/edgespark-template/perch
cd my-perch/server && npm install
cd ../web && npm install
```

## Owner bootstrap (after first deploy)

1. `edgespark var set OWNER_EMAIL=<you>` and `edgespark secret set MGMT_TOKEN_SECRET`
   (the CLI prints a secure browser URL — enter any long random string there).
2. `edgespark deploy`, then open the URL and **sign up** with your `OWNER_EMAIL`.
3. Lock the dashboard: set `disableSignUp: true` in `configs/auth-config.yaml`, then
   `edgespark auth apply && edgespark deploy`.

> `MGMT_TOKEN_SECRET` is a server-side signing key — you never type it again. You log in with
> your email/password. If `OWNER_EMAIL` is set but the secret is missing, the dashboard
> **fails secure** (locked), never open.

## Let an agent manage your page

Hand your AI agent an **API key** (create one in the dashboard → API Keys) and the
`GET /api/public/llms.txt` URL. It drives the management API itself:

```http
POST /api/public/manage/pages           Authorization: Bearer <key>
POST /api/public/manage/pages/:id/links Authorization: Bearer <key>
GET  /api/public/manage/pages/:id/analytics?from=…&to=…
```

Mutations require a Bearer token (owner cookie is accepted only for GET reads); ownership is
always derived from the path + DB, never the request body.

## Structure

- `server/` — Hono API on Cloudflare Workers (D1 + R2), incl. the SSR public page renderer
  (`src/lib/publicPage/html.ts`) and the agent guide (`src/lib/llms.ts`). See `server/CLAUDE.md`.
- `web/` — React SPA dashboard via Vite (`@edgespark/web`). See `web/CLAUDE.md`.
- `configs/` — auth config. `edgespark.toml` — project config.

## Deploy discipline

One production environment. Run `edgespark deploy --dry-run` first. Migrations are
forward-only/additive and run on the default branch.

## License

MIT
