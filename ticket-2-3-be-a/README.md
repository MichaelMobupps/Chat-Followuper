# Ticket 2.3-BE-A — Apollo people-search phone-availability flags

Small backend ticket that extends `ApolloPersonSummary` (and its FE type
mirror) with three fields needed by the bulk multi-select grid in
Ticket 2.3-FE.

## Summary

Apollo's `/api/v1/mixed_people/api_search` already returns per-person
indicators of phone and email availability **without** charging reveal
credits. The current `mapPerson` in `services/apollo.ts` ignores these
indicators, so the seeder UI cannot:

- Filter "people who have direct phone numbers" pre-reveal
- Estimate per-person reveal cost (1 vs 8 credits) before fan-out
- Show enough identity (first name + obfuscated last name) to recognize
  a person in a multi-select grid without bypassing the credit gate

This bundle adds three fields to `ApolloPersonSummary`:

| Field | Type | Source | Purpose |
| --- | --- | --- | --- |
| `directPhoneStatus` | `"yes" \| "maybe" \| "no"` | `raw.has_direct_phone` | Pre-reveal phone availability + credit-cost prediction |
| `hasEmail` | `boolean` | `raw.has_email` | Pre-reveal email availability |
| `lastNameObfuscated` | `string \| null` | `raw.last_name_obfuscated` | Display in multi-select grid before reveal |

## Apollo response semantics (probed against live API)

| `has_direct_phone` value | Maps to | Use this endpoint | Cost |
| --- | --- | --- | --- |
| `"Yes"` | `"yes"` | `revealContact` (sync) | 1 credit |
| `"Maybe: please request direct dial via people/bulk_match"` | `"maybe"` | `requestPhoneReveal` (async webhook) | 8 credits |
| absent / unrecognized | `"no"` | skip | 0 credits |

The mapper is fail-closed — any unrecognized value (including a future
Apollo wording change) maps to `"no"` so SDRs are not accidentally
routed to a paid reveal endpoint that won't return a phone.

## Files in this bundle

```
ticket-2-3-be-a/
├── apply.sh                                       # 7-step ship script
├── README.md                                      # this file
├── docs/
│   └── manual-test-2-3-be-a.md                    # post-deploy verification
├── patches/
│   ├── patch-apollo-service.mjs                   # BE: 2 anchored edits
│   └── patch-fe-apollo-types.mjs                  # FE: 1 anchored edit
└── tests/
    └── integration-2-3-be-a-people-flags.mjs      # live Apollo probe
```

## Files modified by apply.sh

- `artifacts/api-server/src/services/apollo.ts` — extends interface,
  adds `mapDirectPhoneStatus` helper, updates `mapPerson` body
- `artifacts/dashboard/src/lib/api/apollo.ts` — FE type mirror parity
- `artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs`
  — new file (the integration test)

## How to ship (single block for Replit Agent)

After unzipping the bundle into the repo, run:

```bash
chmod +x ticket-2-3-be-a/apply.sh
ticket-2-3-be-a/apply.sh
```

That's it. The script is idempotent — safe to re-run if a step fails
mid-way. Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success (or fully idempotent re-run) |
| 2 | Patch failure (anchor mismatch — file in unexpected state) |
| 3 | Typecheck failure |
| 4 | Build failure |

After the script reports DONE, **republish the Replit deployment** and
then run the integration test (see `docs/manual-test-2-3-be-a.md`).

## What this ticket does NOT do (out of scope)

- **Frontend UI changes.** `ApolloPicker.tsx` person row stays as-is.
  The new flags become useful only when 2.3-FE renders the bulk grid.
- **Credit estimator dialog.** Lives in 2.3-FE.
- **Hide-no-phone toggle.** Lives in 2.3-FE.
- **Routing "yes" vs "maybe" to different reveal endpoints.** That
  orchestration lives in the bulk-flow page (2.3-FE), not in the
  per-person service. Existing `revealContact` / `requestPhoneReveal`
  endpoints are unchanged here.

## Idempotency contract

Each patch script:

1. Counts occurrences of the **new marker** (a distinctive substring of
   the new code that does not exist in the old code).
2. Counts occurrences of the **old anchor** (the exact bytes being
   replaced).
3. Branches:
   - marker > 0, anchor = 0 → SKIP (already applied)
   - marker = 0, anchor = 0 → NOOP (file in unexpected state — fail)
   - marker = 0, anchor = 1 → APPLY
   - anchor > 1 → FAIL (ambiguous match)
   - both > 0 → FAIL (partial state)

This means a re-run after a successful apply is a no-op, and a re-run
after a partial failure picks up where it left off.

## Chain composition (what's preserved)

This patch only adds to `ApolloPersonSummary` and its mapper. It does
not touch:

- `searchOrg` / `searchPeople` / `revealContact` / `requestPhoneReveal`
  function signatures or behavior
- The Apollo route handlers (`routes/apollo.ts`)
- `ApolloRevealedContact` interface (post-reveal shape unchanged)
- Daily-usage tracking, action_log writes, geo-gate behavior
- All prior tickets shipped on the seeder path (1.5b, 1.7, 1.7-BE-2)

The composition with the in-flight 2.3-FE work: 2.3-FE consumes the
three new fields via the FE type mirror; without 2.3-BE-A first, the FE
code in 2.3-FE would have nowhere to read these fields from.
