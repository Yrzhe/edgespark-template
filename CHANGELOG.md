# Changelog

All notable changes to Hatch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0.

## [Unreleased]

### Added
- Local-dev owner fallback: `edgespark dev` now works with zero configuration. When
  `ctx.environment === "dev"` and `OWNER_EMAIL` isn't injected, the logged-in user is
  treated as the owner and a dev-only HMAC secret signs the management token, so the
  dashboard (Connect AI · Sites · API Keys · BaaS Data) is fully usable locally.
  Owner-config resolution is centralized in `server/src/lib/ownerConfig.ts`, shared by
  the `/api/me/token` mint route and the `managementAuth` gate so they always agree.

### Changed
- `disableSignUp` defaults to `false` in `configs/auth-config.yaml` so a freshly cloned
  template can bootstrap its first owner and seed locally. Locking the dashboard remains
  a documented post-bootstrap operator step (`edgespark auth apply && edgespark deploy`).
- Docs corrected: `edgespark dev` does not read `server/.env.local` or `server/.dev.vars`;
  `server/.env.example` is now a reference for the production `edgespark var set` /
  `edgespark secret set` keys, and the README local-dev step is just `edgespark dev`.

### Security
- The dev owner fallback is fail-secure: it is gated strictly on the dev environment,
  never on "config missing". A misconfigured production (no `OWNER_EMAIL`) locks the
  dashboard rather than granting owner access to any logged-in user. Production behavior
  is unchanged whenever `OWNER_EMAIL` is configured.
