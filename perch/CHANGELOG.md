# Changelog

All notable changes to Perch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0.

## [0.1.0] - 2025-05-25

### Added
- **Multi-page link-in-bio.** One owner, multiple link pages — each with its own slug,
  profile, theme, links, and analytics.
- **Rich links.** Standard links, a "featured" hero card, and section headers; drag to
  reorder, toggle to show/hide, with optional thumbnails.
- **SSR public pages** at `/api/public/p/:slug` — server-rendered with per-page
  title/description/OG tags; HTML-escaped content; only active links shown.
- **First-party analytics.** Click + view events with totals, CTR, a zero-filled daily
  time-series, top links, and referrer/device/country breakdowns.
- **Agent-native management API** (`/api/public/manage/*`, Bearer auth) plus a served
  `GET /api/public/llms.txt` so an AI agent can build and manage pages with an API key.
- **Minimal-mono dashboard** (`web/`): Pages · Page editor (Links · Appearance · Preview ·
  Analytics) · Connect AI · API Keys; account menu (display name / avatar / change password /
  logout).
- **Theming**: color / button style / font / avatar / cover, with a live phone preview.
- One R2 bucket (`perch-media`) for avatars, covers, and thumbnails via presigned PUT/GET.
- Perch branding (tab title + favicon).

### Security
- Management mutations require an `Authorization: Bearer` token (owner cookie accepted only for
  GET reads); ownership is derived from the path + DB, never the request body.
- `verifyMgmtToken` rejects an empty/missing signing secret, so a misconfigured production
  (`OWNER_EMAIL` set, `MGMT_TOKEN_SECRET` missing) fails **secure** (dashboard locked).
- SSR theme/social values are strictly validated before injection (no CSS/`javascript:`
  breakout); analytics writes on public routes are best-effort and never block the page.
