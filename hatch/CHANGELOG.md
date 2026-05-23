# Changelog

All notable changes to Hatch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0.

## [Unreleased]

### Added
- **Sites page reworked into a master-detail layout.** The table now paginates (page
  numbers) and sorts by Updated / Created / Name; clicking a row opens a right slide-over
  drawer with that site's public URL, Deploy, and full version history. Scales to many sites.
- Sites list API (`GET /sites`) gained `limit` / `offset` / `sort` / `order` and returns
  `total` for pagination.
- Local-dev owner fallback: `edgespark dev` now works with zero configuration. When
  `ctx.environment === "dev"` and `OWNER_EMAIL` isn't injected, the logged-in user is
  treated as the owner and a dev-only HMAC secret signs the management token, so the
  dashboard (Connect AI · Sites · API Keys · BaaS Data) is fully usable locally.
  Owner-config resolution is centralized in `server/src/lib/ownerConfig.ts`, shared by
  the `/api/me/token` mint route and the `managementAuth` gate so they always agree.

### Changed
- Rebranded the dashboard shell to **Hatch**: tab title is now "Hatch" (was "EdgeSpark App"),
  a Hatch favicon (`web/public/favicon.svg` + `.png`) replaces the EdgeSpark one, and the
  social/meta tags reflect Hatch.
- **Version clarity / rollback semantics:** the version currently serving is badged **Live**
  (it follows `currentVersionId`, so after a rollback it's an older version, not the newest);
  the newest non-live version offers "Restore latest" and every other ready version offers
  "Roll back here". Versions are listed newest-first.
- Sites rows now expose a single **Open** action (view the live site); deploying moved into
  the per-site drawer, removing the earlier Deploy/Open ambiguity.
- Agent guide (`/api/public/llms.txt`) now documents that hosted sites must use **relative**
  URLs (not root-absolute `/style.css`), since sites are served under `/api/public/s/<slug>/`.
- `disableSignUp` defaults to `false` in `configs/auth-config.yaml` so a freshly cloned
  template can bootstrap its first owner and seed locally. Locking the dashboard remains
  a documented post-bootstrap operator step (`edgespark auth apply && edgespark deploy`).
- Docs corrected: `edgespark dev` does not read `server/.env.local` or `server/.dev.vars`;
  `server/.env.example` is now a reference for the production `edgespark var set` /
  `edgespark secret set` keys, and the README local-dev step is just `edgespark dev`.

### Fixed
- **Critical — hosting was 100% broken in production.** The serve path used the Cloudflare
  `caches.default` API, which the EdgeSpark managed Worker is not permitted to access and
  throws on — so every hosted page returned HTTP 500 in production (local Miniflare allowed
  it, so tests passed). Cache access is now best-effort with graceful degradation: serving
  stays correct whether or not an edge cache is available (`server/src/lib/hosting/serve.ts`).
- **Critical — single-file edit/delete always hit `/index.html`.** The
  `PUT`/`DELETE /sites/:id/files/*` routes read Hono's wildcard param, which returns
  `undefined` in the production runtime → the path normalized to `/index.html`, so every
  edit silently overwrote (and every delete removed) the wrong file. The path is now derived
  from the request URL via the site-scoped `/files/` marker (`rawFilePathFromUrl`), with tests.
- Agent guide (`llms.txt`) BaaS example was wrong: it showed `{"siteKey","data"}`, but the
  runtime stores the request body **as** the record and ignores `siteKey`. Following the old
  example produced polluted records. The guide now shows the correct flat-body format.

### Security
- The dev owner fallback is fail-secure: it is gated strictly on the dev environment, never
  on "config missing". A misconfigured production (no `OWNER_EMAIL`) locks the dashboard
  rather than granting owner access to any logged-in user. Production behavior is unchanged
  whenever `OWNER_EMAIL` is configured.
