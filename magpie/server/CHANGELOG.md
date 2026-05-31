# Changelog

All notable changes to the Magpie server are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed (R11 — M-102 run-status orphan)
- **Agent runs now complete eagerly, the moment tools settle.** After R10's inline render, a
  generate run still orphaned in `running`: the trailing model summary turn + the post-loop
  `state="completed"` write ran past the Cloudflare `waitUntil` window (the 90s `setTimeout`
  watchdog died in the same evicted context), so reconcile flipped it to `failed` at ~128s —
  wrong, since the image succeeded. `runToolLoop` now exposes `onToolPhaseSettled`; `runAgentRun`
  uses it to persist `state="completed"` + produced `outputRefs` (asset/layer) the instant a
  producing tool settles — *before* the summary turn — so completion lands in the window the
  asset write already proved survivable. The summary turn only enriches afterward.
- **Reconcile no longer mislabels a productive run as failed.** `reconcileRunRow`: a stale
  `running` run that produced successful output (any `tool_call_result` success / non-empty
  output refs) reconciles to `completed`; only a genuinely empty stale run becomes `failed`.
- **Run output refs now list produced assets/layers** (not just the assistant text), so the
  AgentPanel can show what the run created even if the summary turn is skipped.

### Changed (R10 — M-102 true fix)
- **`generate_asset` now renders INLINE** (supersedes R9's async-offload). R9 made the *run*
  terminate but moved the 5-40s render into a second, nested `waitUntil` that dies past the
  Worker window — so the asset got stuck in `status="generating"` forever (same orphan,
  relocated). The tool now awaits the OpenAI render + `storeGeneratedPng` + flips the row to
  `status="ready"` **before it returns**, so the asset is usable the moment the run finishes. No
  second background. Only the failure-tolerant auto-description stays in the background and never
  gates readiness. Per-tool watchdog raised 25s→60s to fit a real render; budget still pre-checked.
- **Read-time reconcile (`lib/reconcile.ts`, M-102 layer 2).** `GET /assets`, `GET /assets/:id`,
  and `GET /agent/runs/:id` convert a stale `generating` asset (or `running` run) older than 90s
  to a terminal `failed` (persisted) on read — so even a future window-buster surfaces a
  retryable `failed` instead of an infinite spinner. No cron.
- **`status` column on `assets`** (`generating | ready | failed`) — bytes lifecycle, separate
  from `descriptionStatus`. Additive migration `0003_quiet_mastermind.sql`; pre-existing rows
  backfill to `ready`.
- **Agent-run watchdogs (M-102 belt-and-suspenders).** Per-tool-call timeout (now 60s, see R10)
  in the tool loop and a global 90s run watchdog in `streamAgentRunTask` guarantee a run always
  reaches a terminal state. Shared `scheduleBackground()` / `withTimeout()` in `lib/background.ts`.
- **Owner-only R2 garbage collector (M-213)** — `POST /api/public/admin/assets/gc?dryRun=`
  deletes `magpie-media` objects with no `assets`-row reference (keeps referenced + in-flight
  `generating` rows; 10-min upload grace). `lib/storage/gc.ts`. Owner session / owner token only;
  API keys can never reach it.

### Fixed (R9)
- **M-212: asset preview URLs were dead `assets.internal` placeholders.** `GET /api/public/assets`
  and `GET /api/public/assets/:id` now return a real presigned R2 GET URL (`safePresignPreview`,
  ~600s TTL), emitted only when `status="ready"` (so a non-null `previewUrl` reliably means
  "renderable"). Legacy `r2://` rows degrade to `previewUrl: null` instead of leaking a dead URL.
- **`GET /api/public/assets` list contract** — excludes soft-deleted rows, paginated
  (`?limit` ≤100 default 50, `?offset`, optional `?folderId` / `?status`), explicit projection
  (no raw `s3_uri` leak) returning `{ assets, page: { limit, offset, total } }`.

### Added
- **Batch image generation** — `POST /api/public/imagegen/batch` generates up to 6 candidate
  images in one call. Optional `cardId` inherits the card's brand colors, typography, and
  spacing into the prompt prefix (style inheritance from the card spec, falling back to the
  active team brand rules). Concurrency is capped (3) to avoid rate limits; the daily USD
  budget is checked before the batch starts; one `cost_ledger` row is written per generated
  image. Each new asset gets an automatic gpt-4o-mini vision description in the background.
- **Real R2 persistence for generated images (fixes M-101).** New `magpie-media` storage bucket
  (`src/defs/storage_schema.ts`) and `storeGeneratedPng()` (`src/lib/imagegen/store.ts`) —
  both the single and batch flows now `storage.put()` the PNG and persist the canonical
  `s3://magpie-media/<key>` URI from `storage.createS3Uri()`. No more discarded paid images.
- `generateImageOnly()` in `lib/imagegen/openai.ts` — a side-effect-free OpenAI image call
  reused by both single and batch generation; exported `IMAGEGEN_UNIT_MICROS`.
- `buildPresignedGetUrl()` + shared `triggerAssetDescription()` in `lib/description/autotag.ts`
  — real, externally-fetchable presigned GET (via `storage.createPresignedGetUrl`) feeding the
  gpt-4o-mini vision describe; one shared background trigger used by both flows.
- The single `POST /api/public/imagegen` flow now also fires auto-description (previously it
  never described).
- `llms.txt` agent docs now describe the batch endpoint (request/response shapes + rules).

### Changed
- `imagegenCreate()` refactored to reuse `generateImageOnly()` (no behavior change).
- `imagegenBatchRoutes` mounted in `src/index.ts`; deployed to production and verified live.
- Asset `s3_uri` scheme corrected from a hand-built `r2://magpie/...` string to the SDK's
  canonical `s3://magpie-media/...` (produced by `storage.createS3Uri`).

### Fixed
- **M-101 (P0): generated images were never persisted to R2.** The whole imagegen subsystem
  (`buckets = {}`, no `storage.put()`) stored a fabricated `s3_uri` and discarded the bytes, so
  auto-description could never run (vision can't fetch a non-existent object) and batch images
  were lost. Now persisted for real and prod-verified end-to-end: batch `count=3` → 201, assets
  +3, imagegen cost +3, vision-describe cost 0 → 3, descriptions backfilled with accurate vision
  text; single flow verified the same; events clean.

### Deploy note
- Adding a bucket to `storage_schema.ts` requires `edgespark storage apply` **before**
  `edgespark deploy` — deploy does not auto-provision buckets (its preflight fails until applied).
