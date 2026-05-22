# Hatch 🐣⚡

**An AI-agent-native static-site host with a built-in backend**, built on EdgeSpark.
(EdgeSpark is the platform; the product is **Hatch** — use "Hatch" in all user-facing copy.)
See `README.md` for the full overview.

## What it does
- **Hosting**: upload a folder → public URL at `/api/public/s/<slug>/`; immutable
  content-addressed versions + instant rollback.
- **BaaS**: per-site collections (D1) + visitor file uploads (R2) with access rules.
- **Agent-native**: API keys, `scripts/deploy-site.ts` (one-command deploy), and an
  agent guide at `GET /api/public/llms.txt` (base URL injected from the request origin).
- **Dashboard** (`web/`): Connect AI · Sites · API Keys · BaaS Data.

## Owner bootstrap (after first deploy)
1. `edgespark var set OWNER_EMAIL=<you>` and `edgespark secret set MGMT_TOKEN_SECRET` (browser).
2. `edgespark deploy`, then open the URL and **sign up** with your `OWNER_EMAIL`.
3. Lock the dashboard: set `disableSignUp: true` in `configs/auth-config.yaml`, then
   `edgespark auth apply && edgespark deploy`.

## Deploy a site as an agent
`node scripts/deploy-site.ts <dir> <slug> --base https://<domain> --key esk_...`
(Node < 22.18: `npx tsx scripts/deploy-site.ts ...`.) Or hand the agent the API key + the
`/api/public/llms.txt` URL and it will drive the API itself.

## Deploy discipline
One production environment (no staging). `edgespark deploy` updates it live — run
`edgespark deploy --dry-run` first. `migrate` runs on the default branch (main).

## Structure

- `server/` — Hono API on Cloudflare Workers (see server/CLAUDE.md)
- `web/` — React SPA via Vite (see web/CLAUDE.md)
- `server/dev/` — Local-dev helpers (see "Dev Seeds" section)
- `configs/` — Project config files (auth)
- `edgespark.toml` — Project configuration

## Setup

Install dependencies in each directory separately:

```bash
cd server && npm install
cd ../web && npm install
```

## Commands

```bash
edgespark deploy        # build + deploy to platform (run from project root)
```

## EdgeSpark CLI

- **Always run `edgespark <command> --help` before using a command you are unsure about.** Do not guess flags or arguments.
- Run `edgespark` commands on behalf of the user; do not ask the user to run them manually.
- If an `edgespark` command returns a URL, code, or prompt that must be completed by the human owner outside the agent, show it to the user exactly and tell them what to do next. Do not hide it.
- Never run multiple `edgespark` CLI commands in parallel. Run them sequentially.
- If a command fails with "Not authenticated", run `edgespark login`. It prints a URL — show it to the user to open in their browser. Once they approve, re-run the original command.
- `edgespark secret set` prints a secure URL for the user to enter secret values in the browser. Secret values must never pass through agent context or LLM APIs.

## Dev Seeds

`edgespark dev` can seed the local dev database, storage, and auth with reproducible test data by running `server/dev/seed.ts` once at startup. A commented starter lives at `server/dev/seed.ts.example` — rename it to `server/dev/seed.ts` to activate. The seed lives inside `server/` so `drizzle-orm`, `@edgespark/devkit`, and your schema all resolve from `server/node_modules/` — no duplicate deps anywhere.

The default export is `async function seed(ctx: SeedContext<DB>)`. `ctx` exposes:

- `ctx.db` — Drizzle client against the local D1 (pass `SqliteRemoteDatabase<typeof schema>` as the `DB` generic for full type-safe queries)
- `ctx.origin` — dev proxy origin (e.g. `http://localhost:7775`)
- `ctx.fetch(path, init?)` — unauthenticated fetch; relative paths are resolved against `ctx.origin`
- `ctx.auth.createUser({ email, password, name })` — sign up + auto-verify a user; returns `{ user, fetch }` where `fetch` replays the session cookie for same-origin requests only

Re-run semantics: the seed runs on the first `edgespark dev` that sees the file, and re-runs whenever the file contents change OR the user passes `--reset`. Seeds must be idempotent (use `onConflictDoNothing`, or rely on `--reset` to wipe state). Failures are soft — the dev session continues and the next run retries.

See `@edgespark/devkit` for the full `SeedContext` type.

## EdgeSpark Skill References

If you have the `building-edgespark-apps` skill installed, use its references:

- **Always** check `dev-workflow.md` for development workflows (database, storage, auth, vars, secrets, deploy)
- **Always** check `server-patterns.md` when writing server-side code
- **Always** check `web-patterns.md` when writing frontend code with `@edgespark/web`
- **Always** check `auth-patterns.md` when configuring auth providers (OAuth, email/password)
