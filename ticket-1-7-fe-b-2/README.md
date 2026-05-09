# Ticket 1.7-FE-B-2 — Apollo discovery overlay

Adds the 3-stage Apollo picker to the seeder. SDR clicks "Open Apollo picker" above the form, walks brand → org → people → reveal, and the form pre-fills with the discovered contact.

## Scope

3-stage wizard rendered inside a Dialog opened from the seeder's form stage:

| Stage | Endpoint | Cost |
|---|---|---|
| 1. Find a company | `POST /api/apollo/search-org` | $0 |
| 2. Pick an organization | `POST /api/apollo/search-people` | $0 |
| 3. Pick a person | (nav only) | $0 |
| 4. Confirm reveal | (nav only — explicit consent step) | $0 |
| 5. Reveal complete | `POST /api/apollo/reveal` | 1 Apollo credit |

On "Use this contact": dialog closes, form remounts (`formKey` bump) with discovered values as defaults, blue pre-fill banner appears with "Clear" action. On submit, `sourceMode: "apollo"` and `apolloPersonId` + `apolloOrgId` are added to the create payload.

## Out of scope

- **Async phone reveal** (`request-phone-reveal`). When Apollo doesn't return phone in the initial reveal, the SDR fills manually. Async correlation flow is documented as a future ticket.
- **Title autocomplete**. Comma-separated input is v1.

## Pre-fill mapping

| Apollo field | Form field | Note |
|---|---|---|
| `contact.phone` | `phone` | Only if non-null. Apollo usually returns E.164. |
| `contact.name` (or first+last) | `prospectName` | Falls back to first+last concat. |
| `org.name` | `brand` | The org we're targeting. |
| `contact.country` or `org.country` | `country` | Only if matches `^[A-Z]{2}$`. Apollo sometimes returns full names. |
| n/a | `language`, `subVertical`, `product` | Left blank. SDR fills based on the actual outreach intent. |
| `person.id` | (apolloMetadata) | Side-channel state, injected at submit. |
| `org.id` | (apolloMetadata) | Same. |

## Files

```
ticket-1-7-fe-b-2/
├── apply.sh                                    # 4-step orchestrator. Pre-flight bails if FE-B-1 missing.
├── README.md
├── new-files/
│   ├── lib/api/apollo.ts                       # 3 type defs + 3 fetch wrappers
│   ├── hooks/use-apollo.ts                     # 3 react-query mutations
│   ├── components/seeder/ApolloPicker.tsx      # 5-stage discriminated union UI
│   └── pages/seeder.tsx                        # OVERWRITES FE-B-1 page; adds Dialog + ApolloPicker
└── docs/
    └── manual-test-1-7-fe-b-2.md               # free-paths-first checklist
```

## Required secret

`APOLLO_API_KEY` in Replit secrets. Without it, all picker calls return 503 with `apollo_not_configured`.

## Cost notes

- Search-org and search-people are billed by Apollo's plan but typically don't consume per-call credits the way reveal does.
- Reveal is **always** 1 credit, even if it returns no phone. The api-server's geo-gate runs AFTER reveal — geo-blocked reveals still consume the credit.
- Manual test has free-path-first ordering: do the search-only walk before any reveal to spot UI bugs without spend.

## Defect-log status

No new defects. All from prior bundles continue to apply (root typecheck, vite HMR for frontend, β-pattern, no codegen).
