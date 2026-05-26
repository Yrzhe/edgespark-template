# Mockingbird 🪶

**An AI-agent-native, visitor-adaptive personal site**, built on [EdgeSpark](https://edgespark.dev).
Every visitor sees a different version of you — selected from your themes by their browser
signals, and rewritten in the right tone by an LLM.

> Status: scaffold (pre-implementation). Spec: `sources/mockingbird/architecture.md` in the
> parent workspace.

## What it does (planned for v1)

- **Four hand-crafted layouts** in code — Terminal · Magazine · Gallery · Letter.
- **CRUD-able themes** in your admin — each pins a layout + palette + fonts + copy tone +
  match rules + priority. The owner can never create a new layout, only pick one.
- **Passive visitor adaptation** — country, language root, device class, referrer class,
  hour band, returning visitor. No surveys, no surveillance reveals.
- **LLM rewrites text only** — picks one theme from candidates (when matching ties), then
  rewrites blocks in that theme's tone, anchored to your owner-supplied content (bio blurbs,
  projects, socials, images). Never invents facts.
- **First paint never blocks on LLM** — deterministic match + cached or fallback copy
  paints; LLM rewrite streams in over SSE and replaces stable text containers.
- **Agent-native** — Bearer-authenticated management API + served `GET /api/public/llms.txt`
  so an AI agent (handed an API key) can CRUD themes, content, and rules.
- **Privacy-first** — only coarse signals reach the LLM and analytics; precise IP / city /
  ASN / raw UA / raw Referer never leave the server.

## One-command init

```bash
edgespark init my-site --agent claude --template github:Yrzhe/edgespark-template/mockingbird
cd my-site/server && npm install
cd ../web && npm install
```

## Owner bootstrap (after first deploy)

1. `edgespark var set OWNER_EMAIL=<you>` and `edgespark secret set MGMT_TOKEN_SECRET`
   (the CLI prints a secure browser URL — enter any long random string there).
2. `edgespark secret set OPENAI_API_KEY` (or your chosen LLM provider key — see below).
3. `edgespark deploy`, then open the URL and **sign up** with your `OWNER_EMAIL`.
4. Lock the dashboard: set `disableSignUp: true` in `configs/auth-config.yaml`, then
   `edgespark auth apply && edgespark deploy`.

> If `OWNER_EMAIL` is set but `MGMT_TOKEN_SECRET` is missing, the dashboard fails secure
> (locked, never open). If `OPENAI_API_KEY` is missing, the site runs in "default copy"
> mode — themes still rotate by visitor, but the LLM never gets called.

## License

MIT
