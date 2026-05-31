# Magpie 🪶

**A YOUWARE-team brand-materials workbench**, built on [EdgeSpark](https://edgespark.dev).
A magpie hoards shiny things — Bloome letterforms, Renoise transparent assets, palette
swatches, prior renders — and lets the team (or its agents) compose them into
on-brand materials with full provenance and executable brand-rule checks.

> Status: scaffold (pre-implementation).
> Design: `sources/atelier/synthesis.md` in the parent workspace.

## What it does (planned for v1)

- **Library of materials** — every render the team makes lives in the same gallery,
  filtered by template / aspect / creator / tag.
- **Working bench (omnibar → Plan card → Run stream → Material card)** — type the ask
  in plain language, see what the agent is about to do, click Run, watch the steps
  execute, get a first-class material with provenance.
- **Constrained-primitive composer** — agent can only compose with vetted Bloome
  primitives (`{b, e, l, m}` letterform SVGs + Renoise-rendered transparent assets +
  versioned palette + approved fonts). It cannot generate "anything" — that's by design.
- **Executable brand rules** — every Plan card shows a live rule preview (palette
  LCH distance from canonical, clearspace minimums, wordmark letterform fidelity).
  Every Material card shows the rule report. Materials that fail go to a drafts
  queue, not the team pool.
- **Two-gate access** — signup limited to `@youware.com`; new accounts wait in a
  `pending` state until the owner approves them in admin.
- **Cost ledger + daily caps** — per-user budget enforced pre-call; refusal with a
  clear message if exceeded.
- **Agent-native** — the same surface as Hatch / Perch / Mockingbird: Bearer-token
  API parity with the UI, served `llms.txt` + `agent.md`.

## One-command init (when ready to deploy)

```bash
# Not yet templatized — first deploy is direct from this dir.
cd server && npm install
cd ../web && npm install
edgespark var set OWNER_EMAIL=<you>
edgespark secret set MGMT_TOKEN_SECRET
edgespark secret set OPENAI_API_KEY
edgespark db migrate
edgespark storage apply
edgespark auth apply
edgespark deploy
```

## License

MIT (TBD — confirm with YOUWARE before publishing externally)
