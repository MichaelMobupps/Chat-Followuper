# Ticket 1.7-FE-B-1 — Manual seeder flow

The first-half of FE-B (the seeder UI). Everything works end-to-end: SDR fills a form, research streams via SSE, brief is editable, message is generated. **No Apollo discovery** — that's FE-B-2.

## Scope

A multi-stage wizard at `/seeder`:

| Stage | What happens |
|---|---|
| 1. Input | Form: phone (E.164, immutable), brand, country (ISO), language (ISO), subVertical, product, optional context notes, optional campaign attachment. |
| 2. Research | `POST /api/prospects` creates the draft, then EventSource opens the research stream. Live event log + progress indicator. Server emits `progress`, `result`, `error`, `done` events. |
| 3. Brief | Read-only metadata (country, scale tier, competitors, etc.) + editable arguments (hook, why/validation/how, tangible reasons). Native-language versions appear only when language ≠ English. Save → `PATCH /api/prospects/:id` then `POST /api/prospects/:id/generate-message`. |
| 4. Message | Generated subject + body. Body editable for local copy/preview only (see "Known limitations"). "Copy" and "Regenerate" actions. |
| 5. Done | Success card with "View campaign" (if attached) and "Start another" buttons. |

Each stage has an "Abandon draft" path that DELETEs the prospect and returns to step 1.

## Out of scope

- **Apollo discovery** — picker UI for org/people search + reveal. Ships in FE-B-2.
- **Saving message edits** — `PATCH` does not accept `firstMessageBody` (server-controlled). Workaround: copy edited text manually, or refine the brief and regenerate. Future ticket can extend the PATCH allow-list.
- **Prospect detail / list pages** — Prospects nav still placeholder. The success state only links to a campaign (if one is attached).

## Architecture decisions

**β-pattern continued.** All API calls go through `dashboard/src/lib/api.ts` (the `ApiError` + `apiFetch` wrapper from FE-A). No `lib/api-client-react` codegen touched. Types are duplicated for `Prospect` and `ProspectBrief` — single find-and-replace away from removal if codegen adopted later.

**SSE via native EventSource.** The api-server's `/api/prospects/research/stream` is GET-based (per the route's docstring), so EventSource works. Cookies sent automatically (same origin via Replit proxy). The hook closes the connection on `done` to prevent EventSource's automatic reconnect loop, and on unmount.

**Wizard state lives in the page component.** No URL routing for sub-stages; the `/seeder` URL stays constant through the flow. Reload mid-flow returns to the form (browser state lost). The draft prospect, however, persists on the server until explicitly abandoned.

**Brief editor splits read-only research metadata from editable arguments.** Re-running research replaces the entire brief, not mutates it — so showing competitors/scale-tier/etc. as editable would be misleading. Editable fields are exactly those the message generator consumes.

## Files

```
ticket-1-7-fe-b-1/
├── apply.sh                                    # 4-step orchestrator (no patches, all new files)
├── README.md
├── new-files/
│   ├── lib/
│   │   ├── sse.ts                              # useResearchStream hook + ResearchState union
│   │   └── api/
│   │       ├── prospects.ts                    # ProspectBrief + Prospect types + 4 fetch helpers
│   │       └── seeder.ts                       # generateMessage + buildResearchStreamUrl
│   ├── hooks/
│   │   └── use-prospects.ts                    # 5 react-query hooks
│   ├── components/seeder/
│   │   ├── CampaignSelector.tsx                # reuses useCampaigns from FE-A
│   │   ├── SeederForm.tsx                      # input form + zod validation
│   │   ├── ResearchProgress.tsx                # SSE event log
│   │   ├── BriefEditor.tsx                     # 21-field brief editor with metadata/editable split
│   │   └── MessageReview.tsx                   # subject + editable body + copy/regenerate
│   └── pages/
│       └── seeder.tsx                          # orchestrator (REPLACES PagePlaceholder)
└── docs/
    └── manual-test-1-7-fe-b-1.md               # 8-section walk-through
```

## How apply.sh runs

1. Copy 10 files into `artifacts/dashboard/src/`. `pages/seeder.tsx` overwrites the existing PagePlaceholder.
2. Root `pnpm run typecheck` (composite-aware).
3. `pnpm --filter @workspace/dashboard run build` with PORT/BASE_PATH defaults.
4. Best-effort source-code mirror sync.

No patches needed. App.tsx already routes `/seeder` (FE-A established the pattern when adding `/campaigns`). Layout.tsx already has the Seeder nav item (it was there before FE-A).

No api-server restart needed — vite HMR auto-picks-up source changes in dev.

## Defect log corrections baked in

(All from the cumulative defects list; none new in this bundle.)

1. ✅ All API calls go through the FE-A fetch wrapper, no postgres/pg confusion.
2. ✅ No backend-restart problem (frontend-only bundle).
3. ✅ apply.sh uses root typecheck (composite-aware).
4. ✅ No session cookie minting (client uses real auth via the existing AuthGate).

## Live spend warning

The research stream and message generation hit live Anthropic. Per cycle:
- Research: ~$0.05-$0.20 depending on prospect complexity
- Message generation: ~$0.10-$0.20 per call (regenerate doubles it)

The "Dry-run" path in the manual test (`Cancel` within 5s of clicking start) is free and validates the UI without spend.
