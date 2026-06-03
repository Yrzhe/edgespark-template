# Changelog

All notable changes to Magpie are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0.

## [Unreleased]

### Added
- **M-208 — AI auto-layout suggestion (reviewer-verified 🟢, deploy `d0c1c782`).** A `suggest_layout`
  agent tool + `POST /api/public/cards/:id/suggest-layout` (`server/src/lib/layout/suggest.ts`) that,
  given a card's existing layers + canvas + brand rules, asks the LLM for a cleaner arrangement and
  returns geometry ONLY for existing layer ids (clamped to canvas; no new layers, no asset gen; one
  LLM cost row; owner/team authz → 403 on foreign card). Web AI panel / mobile sheet "AI 构图建议"
  button calls it, shows rationale, and applies the proposal through the existing `patchManyLayers`
  path (undoable, persists to `card_spec_json`). Server-only verified on deploy `260d1dcb` (existing
  ids only + cost + foreign 403); shared tree green (111 server tests + web build). Combined deploy
  `d0c1c782` + desktop/mobile e2e + independent Thistle verify all passed (existing ids only, one
  cost row per 200 call, undo/redo/reload, foreign-card 403, served bundle marker present).

- **M-209 — multimodal prompt: attach a reference image → generate same-style (deploy `4a938442`).**
  Reviewer-verified 🟢 (Thistle), server (Awl) + web (Forge). The AI panel / mobile bottom-sheet
  lets the user attach 1–3 of their own library assets as style references; the run carries
  `referenceAssetIds`, and the server **injects them into the `generate_asset`/`batch_generate` tool
  execution** (`references.ts` + ToolContext) so the model can't substitute a different/searched
  asset — the reference is forced through gpt-image-1. Produced assets persist to R2 (`/file` 200
  before+after reload), with cost + llm-auto description rows. **Authz**: referencing an asset not
  owned by the caller returns `403 reference_asset_forbidden`. Composes with M-200 batch (count≥2)
  with no double-charge/orphan. Known nit: a mobile single-image run can occasionally not select a
  producing tool (→ M-239, P3 backlog).

- **Editor polish trio (deploy serving `index-CYPaymrp.js`).** Reviewer-verified 🟢 (Thistle).
  - **M-201 — desktop on-canvas rotate handle.** Brings the mobile rotate handle to desktop
    (≥768px): drag-to-rotate above the selection with snapping; persists `rotation`; the inspector
    rotation field stays in two-way sync. (Closes the desktop side of M-201's residual.)
  - **M-238 — mobile two-finger rotate gesture.** Two-touch angle delta rotates the selected layer,
    persists `rotation`, composes with pinch-zoom.
  - **M-203 — text gradient fill.** Text layers gain a solid↔gradient fill (2 stops + angle),
    rendered via `background-clip:text` so it shows in the editor AND PNG export (pixel-verified).
    Additive `card_spec_json` fields round-tripped via `normalizeLayer`.

- **M-204 — mobile editor (responsive, deploy `2c591428`).** Reviewer-verified 🟢 (Thistle). Adds a
  mobile chrome inside the REAL CardEditor below 768px in ONE component tree (no state fork); desktop
  four-zone is untouched at ≥768px. Zone re-mapping (not a shrunk desktop): left source rail →
  **bottom action bar** (图层/素材/模板/AI); right context container → **slide-up inspector bottom-sheet**
  with peek (quick actions + opacity) and expanded (Transform/Appearance/Effects accordions + context
  tab strip); layers → **bottom sheet** (reorder/visibility/lock); 素材/模板/AI → bottom sheets; edge
  states + delete as bottom-sheet AlertDialog (no native confirm). Canvas gestures: tap-select,
  drag-move, corner-handle resize, snap guides, **rotate handle** (closes the M-201 on-canvas-handle
  residual), pinch-zoom. Reuses the desktop M-229/M-231/M-232/M-230/M-233 field components + commit
  paths verbatim. Two-finger rotate deferred to M-238. (Design: 4 MagicPath comps + research in
  `sources/atelier/magpie-mobile-editor-design-inventory.md`.)

- **M-200 — `batch_generate` agent tool (lazy per-image materialization, deploy `b7d52dfd`).**
  Reviewer-verified 🟢 (Plumb). Adds a 7th agent tool so a run can request multiple images
  (count 1–6) without blocking the Worker agent-run window. A prior synchronous impl timed out
  (`run_timeout_reconciled`, 0 assets even at count=2), so the contract is now **reservation +
  lazy materialization**:
  - `batch_generate` creates N `status='generating'` asset rows tied to the run and returns their
    `assetIds` immediately (no bytes/cost in the run); the run completes instead of timing out.
  - `materializePendingAsset` renders ONE image inline on asset GET/materialize (reusing the
    single-image `generate_asset` path that fits the window), `storeGeneratedPng` to R2, flips to
    `ready`, writes exactly one imagegen cost row + `triggerAssetDescription`. An atomic
    `generating → rendering` claim prevents concurrent/duplicate renders (no double-charge);
    stale `rendering` can retry. No cron — materialization is request-driven.
  - First-turn `tool_choice=batch_generate` is forced for explicit multi-image prompts (prod showed
    the model otherwise looping `generate_asset`). Migration `0004_closed_martin_li`. +tests (101 total).

### Security
- **M-237 — public share API no longer leaks internal DB identifiers (deploy `8eae887c`).** The
  anonymous `GET /api/public/shares/:token` response returned `share.id`, `card.id`, `parentCardId`,
  `cardRootId`, `paletteId`, **`ownerUserId`**, `lockVersion`, timestamps, `ruleReport.id/ruleVersionId`,
  and DB layer ids. It now returns an explicit public DTO — `share.publicAccess` + card
  title/canvas/background/`cardSpec.layers` render fields only — with all DB identifiers, owner id,
  provenance, and raw storage URIs stripped. New opaque token-scoped `GET /api/public/share-assets/:key`
  serves image bytes so `src` can't leak asset DB ids through R2 paths; the web public mapper derives
  local React ids. Authenticated owner/editor responses unchanged. Reviewer-verified clean-context
  (Thistle): recursive key-path + raw-value scan found no forbidden ids/URIs.

### Changed
- **Editor v2 — Phase 3 (templates / AI panels / share / export / edge states, deploy `a52326b3`).**
  Reviewer-verified 🟢 (Thistle).
  - **M-233** — left-rail Templates panel (search + category chips + thumbnail grid + hover 套用,
    real empty state, no fake tiles) and AI panel (prompt + generate/search/compose chips + run steps +
    retryable failure card + produced-asset strip), reusing the existing agent run / per-card
    persistence / SSE replay / produced-asset machinery.
  - **M-234** — Share read-only public link (`POST/GET /api/public/cards/:id/share`,
    `GET /api/public/shares/:token`) with 复制 + public-access toggle, and enhanced Export dialog
    (PNG/JPG/PDF · 1x/2x/4x · transparent toggle disabled-with-reason for non-PNG). Added authenticated
    same-origin `GET /api/public/assets/:id/file` so asset-backed exports get real bytes.
  - **M-235** — edge states: dashed empty-card guide (`用模板开始`), loading skeleton, retryable
    AI-failure/orphan card; native `window.confirm/alert` replaced with custom AlertDialog for
    destructive actions.

- **Editor v2 — Phase 2 (contextual right-inspector, deploy `b7037dc1`).** The right context
  container's 属性 surface now swaps content by selection; 智能体 / 品牌规则 remain sibling surfaces.
  Independently prod-verified by reviewer (Thistle) — every image control persists to
  `card_spec_json`, survives reload, AND affects render (no silent no-ops).
  - **M-229 — contextual inspector.** No-selection/page → canvas W/H, ratio, background, export
    defaults; text layer → Transform / Text / Appearance / Effects accordions.
  - **M-231 — image-layer inspector.** Transform (X/Y/W/H, rotation, lock-ratio) · Image (crop mode,
    filter, corner radius) · Appearance (opacity, blend) · Effects (shadow, stroke). Layer model
    gained additive `card_spec_json` fields (`rotation`, `lockRatio`, `blendMode`, `shadow*`,
    `stroke*`, `cropMode`, `filter`, `cornerRadius`); `normalizeLayer` round-trips them and render
    applies them (rotation, object-fit, grayscale filter, border-radius, opacity, mix-blend-mode,
    box-shadow/stroke). `lockRatio` is intentionally inspector-only (constrains W/H edits, not render).
  - **M-232 — multi-select inspector.** Six-cell align grid (reuses `patchManyLayers`), group/ungroup
    (reuses `groupSelection`/`ungroupSelection`), and shared opacity across all selected layers — all
    persisted + reload-verified.

- **Editor v2 — Phase 1 (four-zone redesign, MagicPath spec).** Reworked `CardEditor` +
  `MagpieShellV2` from the fixed three-tab layout into the four-zone editor: workspace sidebar │
  60px source rail (图层 / 素材 / 模板 / 文字 / AI) switching the left content panel │ center canvas
  stage │ 284px right **context container** that still surfaces 智能体 / 属性 / 品牌规则. All prior
  flows + touchpoints preserved (`frameRef`, `data-card-bg-layer`, `ASSET_DRAG_MIME`,
  `magpie:add-asset-to-card`, `selectedIds[]`). Independently prod-verified by reviewer (Thistle).
  - **M-228 — editor 素材 rail wired to assets.** The source-rail Assets panel now fetches the same
    `GET /api/public/assets` as the global library, renders R2 preview tiles with distinct
    loading / error / empty / populated states, and reuses the existing add path (drag =
    `ASSET_DRAG_MIME`, click = `magpie:add-asset-to-card`). Verified: rail tiles 19 == endpoint 19;
    click-add and drag-add both persist to `cards.card_spec_json` across reload.
  - **M-230 — layer rows: visibility + lock.** Each layer row shows drag handle + visibility eye +
    lock + type icon + name + selected state; visibility/lock toggles route through `commitLayers`
    and persist to `card_spec_json` (verified via PATCH → D1 → reload).
  - **M-236 — responsive top-bar.** The shell auto-compacts its sidebar at ≤1180px and the editor
    rails shrink (264/284 → 236/260); toolbar secondary labels collapse to icon buttons with
    `aria-label`/`title`; the center column clips/scrolls its own toolbar instead of painting over
    the fixed right context rail. Verified at 1280 / 1024 / 960px — no overlap, no per-glyph CJK wrap.

### Added
- Web R9 (assets+brand wave, deploy `c2615c15`):
  - **M-225 — agent-produced assets now visible.** The client SSE subscriber never registered
    listeners for the named `tool_call_start` / `tool_call_result` events, so EventSource dropped
    every produced `assetId`. Now registered + harvested (`resultPreview.assetId`/`assetIds`,
    deduped) into a **PRODUCED** thumbnail strip in the Agent panel — each thumb click-to-enlarge,
    draggable to canvas, with an "Add to card" button; pending (async-generating) assets show a
    spinner and poll until the bytes land in R2. Prod-verified: "generate two coral bird cutouts"
    → 2 real thumbnails.
  - **M-226 — Asset Library shows real images.** `AssetItem`/`toAssetItem` never carried
    `previewUrl`, so tiles drew placeholder art. Now renders real R2-presigned `<img>` thumbnails
    (onError fallback), each draggable (`ASSET_DRAG_MIME='application/x-magpie-asset'`), with a
    click-to-enlarge lightbox, "Add to card", and fixed-height + "Load more" pagination.
  - **M-227 — agent runs survive navigation.** New `src/lib/runStore.ts` persists run ids per
    card in localStorage; the editor re-fetches + re-subscribes on mount (server replays the full
    event log), rehydrating steps + produced assets instead of losing in-memory state.
  - **M-223 — no more JSON for brand rules.** The CardEditor Rules panel rendered active rules as
    raw JSON `<pre>`; now human-friendly swatches/type/spacing + an "Edit brand rules →" link to
    the structured `/rules` editor. The `/rules` empty state gains a "Create brand rules" button
    (`POST /api/public/manage/rules`) so a brand-new team is never stuck input-less.
  - Correctness: image layers persist a durable `assetId` and re-presign `src` from it at card
    load (`resolveLayerAssetSrcs`) so a reload no longer breaks the image when the presigned URL
    expires.
- Server R6 (agent tool-use): the agent run now really calls tools via OpenAI function
  calling instead of only returning text. New `src/lib/agent/{tools,openai,loop}.ts` add a
  6-tool V1 surface — `search_asset`, `describe_asset`, `generate_asset`, `get_brand_rules`,
  `get_card_layers`, `add_layer_to_card` — driven by a streaming multi-turn loop
  (`MAX_ITERATIONS=5`) that emits new SSE events `tool_call_start` / `tool_call_result`.
  `POST /api/public/agent/runs` accepts an optional `cardId`; every tool call is logged to
  `events` (`code=agent_tool_call`); `generate_asset` cost flows through the existing imagegen
  ledger; `add_layer_to_card` is creator/owner-gated. +14 tests. Prod curl-verified: the
  agent chained search→generate, and add_layer really mutated the card (layers 3→4).
  Known limit: synchronous image-gen inside the background loop can exceed the Worker window
  (text/search/add_layer paths are unaffected). (`magpie-server-batch-R6-tool-use-report.md`)
- Web R6 (card export): a toolbar **Export** button in the Card Editor opens a dialog to
  download the current card as **PNG / JPG / PDF** at **1× / 2× / 4×** of its real
  resolution (`card.width × card.height`, not the scaled preview), with an optional
  transparent-background mode for PNG. New `src/lib/export.ts` + `ExportDialog.tsx`;
  i18n zh/en. Renders via `html-to-image` (SVG foreignObject) rather than html2canvas,
  because the editor chrome uses `color-mix(in oklab …)` + Tailwind v4 `oklch(…)` that
  html2canvas's CSS parser cannot handle; PDF embedding via `jsPDF`. The canvas frame is
  `overflow-hidden`, so the ±80px drag bleed is clipped automatically (Canva-style).
  Prod-verified: PNG 1×→1080², 2×→2160², PDF opens, transparent corner alpha 0.

### Fixed
- Web M-070 (agent tool-use unreachable from the UI): both UI run paths — the shell topbar
  Omnibar (`runOmni`) and the editor Agent panel (`runAgent`) — called
  `POST /api/public/agent/runs` **without `cardId`**. The server always runs the R6 tool loop,
  but with `cardId=null` its system prompt instructs the model to refuse ("No card is open…
  ask them to open one first"), so no tools fired, `card_id` stayed NULL, and no
  `agent_tool_call` events were logged. Fix (`web/src/App.tsx`): the Omnibar now derives the
  open card from the `/editor/:cardId` route and the Agent panel passes the open
  `card.id`; both send `cardId`. Also removed the dead client-side `plan.steps`
  (`assets.search/copy.draft/compose/rules.check`) that was stored verbatim into `plan_json`
  and misread as a "legacy step-planner" — rendered steps come from the SSE stream, not the
  client plan. (`magpie-web-m070-fix-report.md`)
- Server R5.5 (cost-ledger `todayUsdSpent` double-charge): a single logical compose was
  charged twice — a premature `worker.compose` row at `POST /api/public/agent/runs` (before
  any compose happens) plus the real charge at card-save — inflating `todayUsdSpent` 2–3×.
  The read query (`me.ts`, `sum(cost_micros)/1_000_000`) was always correct. Removed the
  premature `/runs` charge (kept `checkCost` as a budget pre-gate); compose is now billed
  exactly once at card-save, where `writeCardComposeCostOnce` dedupes by `cardId`. Added 2
  regression tests. (`magpie-server-batch-R5.5-report.md`)
- Web R5 (canvas-editor surgical fixes, `CardEditor.tsx`, per Plume's research):
  - **(a) Headline line** — the hardcoded fixed-width 120px coral SVG squiggle under
    every text layer is gone. Replaced by a per-layer `decoration` field (default
    `none`) rendered with native CSS `text-decoration` (`solid`/`wavy`/`dashed`/
    `dotted`), which auto-tracks text width. New Inspector "Decoration" dropdown for
    text layers; field persists across reload (`normalizeLayer`).
  - **(b) Asymmetric drag clamp** — drag/resize clamped only the lower bound
    (`max(0)`, no `min`), so elements stuck at left/top but ran off right/bottom.
    Replaced with a symmetric `clampPos(BLEED=80)` (Canva-style bleed on all four
    edges; canvas is `overflow-hidden` so export clips to the page).
  - **(c) Dead opacity slider** — Inspector opacity slider was uncontrolled
    (`defaultValue`, no handler). Now controlled `value` + `onChange →
    patchLayer({opacity})`; the layer's `style.opacity` already renders.
  - **(d) Janky canvas** — every drag/drop/slider tick awaited a network save with a
    spinner. Now optimistic local commit + 600ms-debounced background persist (no
    spinner; rapid edits coalesce; flushed on unmount). Added `cursor: grabbing`
    during drag. (Snap guides / keyboard nudge / undo deferred to R5.5 per the plan.)
- Web R4 (batch-R4 narrow fixes, web-only):
  - **A9** Save draft now always shows a toast. Layer autosaves bump the server
    lockVersion but only updated `cardLockVersionRef`, so the explicit save sent a
    stale `lockVersion` and 409'd on a branch that refreshed silently. Save now
    reads the freshest lockVersion, retries once against the server's current
    version on conflict, and emits a toast on every outcome (success/conflict/cap).
  - **E12** Agent panel now renders the live SSE stream. The client ignored the
    server's `stepId`/`label`/`delta` fields and never listened for the `done`
    event, and runs launched from the shell Omnibar were never handed to the
    editor panel. Mapped the real event schema, added the `done` listener with
    per-id dedupe + cost finalize, and bridged Omnibar runs into the panel.
  - **R3.5** Added-headline cascade offset widened 24px → 48px so three stacked
    headlines read as distinct rows instead of overlapping.

### Added
- Scaffold: directory tree + identity files (README, CHANGELOG, edgespark.toml,
  package.json shells, configs/auth-config.yaml, .gitignore).
- Architecture spec at `../sources/atelier/synthesis.md` (synthesis of three
  parallel brainstorms: Awl architect / Loom product-UX / Bobbin wildcard).
