# Ticket 2.3-FE — bulk WhatsApp prospect page

Replaces the placeholder at `/prospect/whatsapp` with the full bulk
multi-prospect flow described in the placeholder text:

> Paste or upload a list of URLs — Play Store, App Store, or company
> website. System resolves each URL to a brand domain. System finds
> people at each company who have direct phone numbers in Apollo,
> filtered to relevant titles and seniorities. You see a flat
> multi-select grid of candidates across all companies. No reveal
> credits spent yet. Tick the people you want. Choose draft-only or
> auto-send. System reveals only the ones you ticked.

## State machine

```
INPUT  → DISCOVER  → GRID    → ESTIMATE → REVEAL    → DONE
URLs    per-URL     filters,   confirm   per-prospect grouped
        progress    multi-     dialog    fan-out      results
                    select               (concurrency 3)
```

## Decisions locked in this ticket

| # | Choice | Rationale |
| --- | --- | --- |
| One ticket vs split | One | Split A alone has nothing testable end-to-end |
| Bulk select cap | Soft cap 25 + override button | Catches accidental select-all, not punishing for power users |
| Per-row failure | Skip-and-continue | Apollo credits for successes shouldn't be wasted by one transient blip |
| DONE screen | Stay on bulk page with grouped results | Power-user friendly; "New batch" button resets state |

## Workaround for the `researchBrief` requirement

`generateMessage` requires `prospect.researchBrief`. Bulk flow can't run
25 sequential research streams (~$2 + 15 minutes). **Workaround**: the
page synthesizes a minimal `ProspectBrief` from Apollo data alone (no
LLM calls) and PATCHes it onto the prospect before calling
generateMessage. The route's `isResearchBrief` check is light (just
`typeof === "object" && !== null`), so the stub passes.

Trade-off: messages are doctrine-correct but less personalized than
the seeder's full-research version. SDR can re-research individual
prospects via the seeder later. Better message quality is a follow-up
ticket once a "research existing prospect" UI is built.

## Files in this bundle

```
ticket-2-3-fe/
├── apply.sh                           # 9-step idempotent ship script
├── README.md                          # this file
├── docs/
│   └── manual-test-2-3-fe.md          # 12-scenario walkthrough
├── patches/
│   └── patch-fe-apollo.mjs            # 3 anchored edits in apollo.ts + use-apollo.ts
└── new-files/
    ├── lib/api/prospector.ts          # resolveUrls client + ResolvedUrl type
    ├── lib/api/whatsapp.ts            # getWhatsappLink + recordSendIntent
    ├── hooks/use-prospector.ts        # useResolveUrls
    ├── hooks/use-whatsapp.ts          # useWhatsappLink + useSendIntent
    ├── components/whatsapp-bulk/
    │   ├── UrlInput.tsx               # paste/upload + URL classifier
    │   ├── DiscoveryProgress.tsx      # per-URL progress card
    │   ├── CandidateGrid.tsx          # multi-select + filters + credit estimator
    │   ├── RevealConfirmDialog.tsx    # final cost confirmation
    │   ├── BulkSavingProgress.tsx     # per-prospect fan-out display
    │   └── BulkResults.tsx            # grouped results with WhatsApp link buttons
    └── pages/prospect/whatsapp.tsx    # page-level state machine + fan-out
```

## Files modified by apply.sh

- `artifacts/dashboard/src/lib/api/apollo.ts` — adds `requestPhoneReveal` client + types
- `artifacts/dashboard/src/hooks/use-apollo.ts` — adds `useRequestPhoneReveal` hook + import update
- `artifacts/dashboard/src/pages/prospect/whatsapp.tsx` — replaces placeholder

## Backend touchpoints (all already shipped, NO new endpoints)

| Endpoint | Used for | Shipped in |
| --- | --- | --- |
| `POST /api/prospector/resolve-urls` | URL → brand resolution | 2.1-BE |
| `POST /api/apollo/search-org` | brand → org list (auto-pick top) | 1.5b |
| `POST /api/apollo/search-people` | org → people with directPhoneStatus | 2.3-BE-A |
| `POST /api/apollo/reveal` | sync 1-credit reveal for "yes" | 1.5b |
| `POST /api/apollo/request-phone-reveal` | async 8-credit reveal for "maybe" | 1.5b |
| `POST /api/prospects` | create with phone (yes) or null phone (maybe) | 2.3-BE-B |
| `PATCH /api/prospects/:id` | attach stub researchBrief | 1.7-BE-2 |
| `POST /api/prospects/:id/generate-message` | 3-stage Doctrine | 1.7 |
| `GET /api/prospects/:id/whatsapp-link` | wa.me deep link (DONE screen) | 1.6 |

## How to ship

```bash
chmod +x ticket-2-3-fe/apply.sh
ticket-2-3-fe/apply.sh
# Then restart the dashboard workflow (Defect #7)
# Then open /prospect/whatsapp and run through docs/manual-test-2-3-fe.md
```

## Replit Agent prompt

```
Apply ticket-2-3-fe from the uploaded zip. This is the bulk WhatsApp
prospect page. No backend changes — all endpoints already shipped.

Steps:

1. Unzip ticket-2-3-fe.zip.
   Command: rm -rf ticket-2-3-fe && unzip -o ticket-2-3-fe.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-2-3-fe/apply.sh

3. Run apply.sh and capture full stdout + stderr.
   Command: ticket-2-3-fe/apply.sh

   Applies anchored patch + copies 9 new files + dashboard typecheck +
   build. If exit non-zero, paste full output and stop.

4. After apply.sh exits 0, restart the dashboard workflow so the
   served bundle reloads.

5. Open the bulk page in a browser:
     - Localhost: http://localhost:3000/prospect/whatsapp (or whatever
       port the dashboard serves on)
     - Production: https://chat-followuper.replit.app/prospect/whatsapp
   Confirm the page renders the new bulk UI (URL paste textarea + title
   filters + Discover button), NOT the old placeholder text.

6. Walk through the 12 scenarios in docs/manual-test-2-3-fe.md and
   report which pass / fail.

7. Report back:
   - apply.sh exit code
   - dashboard typecheck output (any warnings)
   - dashboard build size
   - First-render screenshot or text description of /prospect/whatsapp
   - Manual test pass count

Hammer-vs-nail: do not modify any source files yourself. The patches
are the only legitimate way to change the codebase.
```

## What this ticket does NOT include

- **Real-time research per prospect** — bulk flow synthesizes stub briefs. Better quality is a follow-up.
- **Async reveal arrival notification** — when "maybe" prospects' phones arrive via Apollo's webhook, the SDR is no longer on this page. Mailgun reminder emails (planned separately) and the eventual /prospects list page will surface them.
- **Telegram channel** — Phase 2, separate ticket.
- **Auto-send** — explicitly deferred. Mode A click-send via wa.me is the v1 path.
- **Per-row retry on failed prospects** — failed rows are visible in the DONE screen with reasons; SDR can re-tick the people in a new batch.
