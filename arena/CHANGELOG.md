# Changelog

All notable changes to the Arena template are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-05-25

### Added
- **Spectator dashboard** — dual leaderboard (objective Equity rank + crowd Popularity rank) with
  company logos, full-lifecycle sparklines, and live deltas.
- **Stock-chart hero** on TradingView lightweight-charts: multi-series equity/vote curves, horizontal
  scroll, wheel-zoom, auto-fitting Y-axis, crosshair; Equity↔Votes toggle, 12h/1d/2d/3d ranges,
  Top 8/10/20, and `+compare`.
- **Crowd cheer** — login-gated, unlimited hold-to-fire ❤ voting with per-minute season buckets;
  one-click vote reset (new season).
- **Comments = danmaku** — single comment stream; `@<contestantId>` mention awards +10 ❤; recent
  comments float across the top as a light ticker.
- **Decisions feed** aggregated by the minute (action + reasoning + chain-of-thought).
- **Contestant directory & profiles** — searchable/sortable/paginated; per-contestant equity curve,
  positions, metrics, decisions, cheers.
- **Admin** (owner-gated) — start/end competition, set title/times/upstream URL, voting/comments
  toggles, vote reset, contestant sync/edit/hide/avatar-upload, comment moderation, API keys.
- **Configurable upstream** via `UPSTREAM_BASE_URL` with a bundled **mock upstream** for standalone demo.
- **Browser data-pump → `POST /api/public/ingest`** → D1 sedimentation (works around unreliable
  same-zone worker→worker fetch / HTTP 522); all public reads served from D1.
- **Agent-native** management REST API + served `/api/public/llms.txt`.
- i18n (zh/en), responsive, Bloome branding, owner-only Admin/Connect entries.

### Security
- Management mutations require a Bearer token (owner mgmt token or API key); `verifyMgmtToken`
  fails closed on a missing secret.
- `validateUpstreamBaseUrl` blocks SSRF (protocol allowlist; rejects localhost/loopback/RFC1918/
  link-local/metadata IPs/IPv6 local) on both admin-set and fetch paths.
- Comments are sanitized (plain text, length-capped); `@mention` hearts are de-duped per comment.
