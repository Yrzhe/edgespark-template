# Hatch 🐣⚡

**An AI-agent-native static-site host with a built-in backend — one command to stand up your own.**

Your AI agent (Claude Code, Codex, Cursor, …) builds a static site; Hatch hosts it on
Cloudflare's edge in one command, gives it a backend (data + files), and exposes a
machine-readable guide so the agent knows exactly how to deploy, edit, roll back, and
store data. Built on [EdgeSpark](https://edgespark.dev).

## What you get

- **Static hosting** — upload a folder, get a public URL. Immutable, content-addressed
  versions with **instant rollback** and cross-site dedup.
- **BaaS** — per-site **collections** (D1) + visitor **file uploads** (R2) with access
  rules (`public-append` / `public-read` / `private`) and rate limiting.
- **Agent-native** — agent **API keys**, a one-command deploy helper, and an
  agent-readable guide at `/api/public/llms.txt` (base URL injected dynamically).
- **A dashboard** — Connect AI · Sites · API Keys · BaaS Data (refined, light).

## One-command start (for a new instance)

```bash
edgespark init my-hatch --agent claude --template github:<owner>/hatch
```

Then your agent runs the printed next-steps:

1. `cd my-hatch/server && npm install` and `cd ../web && npm install`
2. `edgespark var set OWNER_EMAIL=<your email>` — locks the dashboard to you
3. `edgespark secret set MGMT_TOKEN_SECRET` — enter a strong value in the browser
   (e.g. `openssl rand -base64 32`)
4. `edgespark db migrate` · `edgespark storage apply` · `edgespark auth apply`
5. `edgespark deploy`

**Bootstrap the owner:** open the deployed URL, sign up with your `OWNER_EMAIL`, then set
`disableSignUp: true` in `configs/auth-config.yaml` and run
`edgespark auth apply && edgespark deploy` to lock the dashboard to just you.

## Connect your AI

Give your agent two things (the dashboard's **Connect AI** page generates both):

1. an **API key** (create it under API Keys — shown once), and
2. the docs URL **`https://<your-domain>/api/public/llms.txt`**

The agent fetches that URL and learns the full API. Or deploy a folder directly:

```bash
node scripts/deploy-site.ts ./dist my-site --base https://<your-domain> --key esk_...
# (Node < 22.18: npx tsx scripts/deploy-site.ts ...)
```

## Local development

```bash
cp server/.env.example server/.env.local   # set OWNER_EMAIL + MGMT_TOKEN_SECRET
edgespark dev                                # http://localhost:7775
```

## Project layout

- `server/` — Hono API on Cloudflare Workers (hosting + BaaS + agent docs); schema in `server/src/defs/`
- `web/` — React dashboard (`@edgespark/web`, Tailwind)
- `scripts/deploy-site.ts` — zero-dep deploy helper
- `configs/auth-config.yaml` — auth (email/password)

## Notes

- One production environment today (no staging) — `edgespark deploy` updates it live; use
  `edgespark deploy --dry-run` first.
- Hosted sites are served same-origin at `/api/public/s/<slug>/`. Host **your own / your
  agent's** content; for untrusted third-party content, isolate on a separate origin
  (subdomain) — see the security notes in `docs`.
