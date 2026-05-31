export function buildLlmsTxt(origin: string): string {
  const baseUrl = origin.replace(/\/+$/, "");
  return `# Magpie — Agent Guide

Base URL: ${baseUrl}

Magpie v3 uses cards-as-templates plus a central asset library. Approved users and agent API keys may use the agent surface; API keys never have owner permission and must not call management routes.

\`\`\`http
Authorization: Bearer <agent-api-key>
Content-Type: application/json
\`\`\`

## Required Agent Rules

- Always call cost.check implicitly through the server before chargeable operations.
- Use assets.search, assets.imagegen.create, copy.draft, compose, and cards.save. Renoise is owner-only and is not part of the agent surface.
- cards.save must include agentRunId, templateVersion, and ruleVersionAtSave provenance. The server evaluates rules on every save.
- If a card fails rules, requested status=ready is forced to draft and the response includes a 409 rule report unless an owner override is recorded.
- Image generation has two modes: transparent for isolated small assets; opaque for full posters or hero scenes. Both inject the active palette and Bloome visual DNA unless the user overrides.

## Agent Run Tool Use

POST /api/public/agent/runs starts a server-side agent that really calls tools (OpenAI
function calling) while it streams. Include an optional cardId in the POST body to give the
run a working card. The agent may chain up to 5 tool iterations (e.g. search → generate →
add). Available tools:

- search_asset(query, limit?=10) — fuzzy-search the team asset library by description/name/tags. Returns { assetId, name, description, thumbnail }[].
- describe_asset(assetId) — full description + metadata for one asset.
- generate_asset(prompt, transparent?=false) — generate a brand-on image (active palette + Bloome DNA) and add it to the library. Returns { assetId, status: "generating", mode } immediately; the image renders asynchronously and the asset flips to status="ready" once its bytes land (status="failed" on error). You may reference the assetId right away (e.g. add_layer_to_card) without waiting. Chargeable; counted in the cost ledger.
- get_brand_rules(cardId) — the card's canonical palette colors + clearspace/letterform thresholds.
- get_card_layers(cardId) — the card's current layers.
- add_layer_to_card(cardId, layer) — append a layer { type: text|asset|bg, text?, assetId?, x, y, width, height, opacity?, decoration? }. Caller must be the card creator or owner.

Every tool call is recorded in the events table (code=agent_tool_call) for observability.

## Public Docs

GET ${baseUrl}/api/public/llms.txt
GET ${baseUrl}/api/public/agent.md

## Approved User / Agent Routes

GET ${baseUrl}/api/me
GET ${baseUrl}/api/me/token
GET/POST/PATCH ${baseUrl}/api/public/cards
GET ${baseUrl}/api/public/cards/:id/rule-report
GET/POST/PATCH/DELETE ${baseUrl}/api/public/assets
GET/POST ${baseUrl}/api/public/asset-folders
GET/POST/PATCH/DELETE ${baseUrl}/api/public/agent/sessions
GET ${baseUrl}/api/public/agent/sessions/:id/runs
POST ${baseUrl}/api/public/agent/runs
GET ${baseUrl}/api/public/agent/runs/:id
GET ${baseUrl}/api/public/agent/runs/:id/events
GET ${baseUrl}/api/public/palettes
POST ${baseUrl}/api/public/imagegen
POST ${baseUrl}/api/public/copy/draft

## Owner Management Routes

GET/PATCH ${baseUrl}/api/public/manage/profiles
POST ${baseUrl}/api/public/manage/profiles/:userId/restore-approved
GET/POST/PATCH ${baseUrl}/api/public/manage/rules
GET/POST/DELETE ${baseUrl}/api/public/manage/keys
POST/PATCH/DELETE ${baseUrl}/api/public/manage/palettes

## Hidden Metadata

Asset descriptions are generated with gpt-4o-mini vision for search metadata. They are hidden from normal user UI; owner admin asset reads may include them.

## Agent Run SSE Events

Subscribe to GET /api/public/agent/runs/:id/events after POST returns a run id.
Events use text/event-stream with event names: step_start, output, tool_call_start, tool_call_result, step_end, done, error.
Each data payload is JSON: { id, runId, type, stepId?, label?, delta?, output?, createdAt }.
Tool events add fields: tool_call_start → { tool, args }; tool_call_result → { tool, resultPreview, success }.
`;
}
