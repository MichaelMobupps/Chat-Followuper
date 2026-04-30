# Ticket 1.4 — Group B.5: Doctrine matrix + research stage

## What this delivers

The doctrine layer that makes Chat Followuper's messages match Email Prospector's quality.

### New files (drop-in additive — no existing code changed)

**Doctrine matrix** at `artifacts/api-server/src/lib/doctrine/`:

- `taxonomy.ts` — ~220 sub-vertical codes split by `(platform_family, top_level_vertical)`. Helpers: `getDoctrineDomain`, `getTopLevelVertical`, `isValidSubVertical`, `getDisplayLabel`.
- `eventCatalog/` — per-sub-vertical vocabulary blocks (primary event, alternative events, KPI terms, mechanic terms). Split by platform-family file: `mobileGaming.ts` (18 sub-verticals), `mobileNonGaming.ts` (~100), `webCps.ts` (~40), shared types in `types.ts`, dispatcher in `index.ts`.
- `volumeBenchmarks/` — daily-volume calibration tables for all 25 top-level verticals × 4 scale tiers (small/mid/large/mega). Anchors the research stage's `calibratedDailyVolume` to a single number.
- `firewall/` — vertical-firewall maps that catch and replace cross-vertical terminology leaks. Per platform-family file. Case-sensitive matching for terms that overlap with common English words ("install", "Adjust", "Singular") to avoid corrupting legitimate prose.
- `proofPoints/` — pool of MAFO-aware proof reasons MobUpps can credibly commit to. Per platform-family file. Categorized by supply / quality / mafo / operational.
- `researchPrompts/` — Opus 4.7 system prompts for the research stage. Per platform-family file. Carries geo rule, subsidiary filter, volume calibration, vocabulary block, proof points pool, native-language argument requirement.

**Services** at `artifacts/api-server/src/services/`:

- `progressEvents.ts` — SSE event protocol with `LoggingProgressEmitter` and `SseProgressEmitter` classes, plus `emitLlmSubstage` / `emitInfo` helpers.
- `prospectResearch.ts` — research stage orchestrator. Calls Opus 4.7, parses + validates JSON, returns `ProspectBrief`. Includes 90-second timeout, brand-name sanitizer, late-rejection swallowing.

**Route** at `artifacts/api-server/src/routes/`:

- `researchStream.ts` — `GET /api/prospects/research/stream` SSE endpoint. Includes explicit auth gate.

### Patches (modify existing files)

- `PATCHES/01-prospects-schema-patch.ts` — adds `researchBrief jsonb` column to `prospects` table. Includes full PATCHED_PROSPECTS_SCHEMA constant for drop-in replacement.
- `PATCHES/02-message-generator-patches.ts` — wiring patches:
  - PATCH A modifies `messagePrompts.ts`: adds vocabulary block + research brief block injection into prospector and followuper system prompts
  - PATCH B modifies `messageGenerator.ts`: switches DRAFT_MODEL Sonnet → Opus 4.7, accepts `researchBrief` option, runs firewall pass in `finalizeMessage`

## Apply order

1. **Schema migration first** — apply patch 01, generate + apply Drizzle migration
2. **Drop in new files** — copy `artifacts/api-server/src/lib/doctrine/`, `services/progressEvents.ts`, `services/prospectResearch.ts`, `routes/researchStream.ts` into the repo
3. **Wire the route** — add `app.get("/api/prospects/research/stream", researchStreamRoute)` to the Express app initialization
4. **Apply patches 02 A and B** — modify `messagePrompts.ts` and `messageGenerator.ts` per the patch instructions
5. **Sync `artifacts/api-server/src/` → `source-code/src/`** via `bash scripts/sync-source-code.sh`
6. **Typecheck** to confirm everything compiles

## Audit history

This delivery passed the full Beautiful-Squidward audit per `debug-self-audit-project-prompt-v5.md`.

- **Round 1:** 1 High, 5 Medium, 4 Low findings. All High and Medium fixed.
- **Round 2:** 2 Medium findings (sanitizer empty-result re-validation, late-rejection unhandled). Fixed.
- **Round 3:** 0 Medium-or-higher, 3 Low. Convergence candidate.
- **Round 4:** 0 Medium-or-higher, 3 Low. **CONVERGENCE CONFIRMED** (two consecutive clean rounds).

## File count

- 16 TypeScript source files (~4,400 lines)
- 2 patch files
- 1 README (this file)
