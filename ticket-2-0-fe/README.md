# Ticket 2.0-FE — Nav restructure

First ticket of the Phase 2 reframe. Adds the new top-level navigation structure (Prospect / Follow-up split, channel sub-tabs) with placeholder pages. No backend touched, no Apollo touched, no spend.

## Why this ships first

The new flow (paste URLs → multi-company discovery → multi-select → bulk action) lives at different routes than the old single-prospect Seeder. Shipping the routes + nav structure first lets the rest of Phase 2 land tile by tile, with each subsequent ticket making one of these placeholders real.

This bundle is intentionally trivial. Risk: low. It exists to decouple nav from feature work.

## What ships

**4 new page files**, each a friendly stub explaining what the real implementation will do and which ticket delivers it:

| Route | Placeholder calls out | Real ticket |
|---|---|---|
| `/prospect/whatsapp` | URL ingest + multi-company discovery + multi-select + draft / send | 2.3-FE |
| `/prospect/telegram` | Parity with WhatsApp prospect | 2.6 |
| `/followup/whatsapp` | List, status filter, per-prospect actions, sequence config | 2.5-FE |
| `/followup/telegram` | Parity with WhatsApp follow-up | 2.6 |

**2 anchored patches**:
- `App.tsx`: 4 imports + 4 routes (anchored on FE-A's Campaigns import + route).
- `layout.tsx`: 2 icon imports (`MessageCircle`, `Send`) + 4 nav items (anchored on FE-A's Campaigns nav line).

The Prospect: WhatsApp placeholder includes a prominent **"Open Seeder (legacy)"** button so the SDR can keep working with the old flow during the migration window.

## What does NOT change

Kept intact for migration safety:

- `/seeder` route — full single-prospect flow still works.
- `/prospects` and `/followups` legacy placeholders — still in nav, still routable.
- `/campaigns` and all FE-A work — untouched.
- All backend routes — untouched.

The old "Prospects" and "Followups" nav items will retire when 2.3 and 2.5 ship, respectively. Until then, the sidebar is slightly cluttered. Acceptable trade-off for safe migration.

## Files

```
ticket-2-0-fe/
├── apply.sh                                    # 5-step orchestrator
├── README.md
├── new-files/
│   └── pages/
│       ├── prospect/whatsapp.tsx               # placeholder + legacy seeder link
│       ├── prospect/telegram.tsx               # placeholder
│       ├── followup/whatsapp.tsx               # placeholder
│       └── followup/telegram.tsx               # placeholder
├── patches/
│   ├── patch-app-routes.mjs                    # 4 imports + 4 routes
│   └── patch-layout-nav.mjs                    # 2 icons + 4 nav items
└── docs/
    └── manual-test-2-0-fe.md
```

## Audit (Option A protocol, 1 round, 7 passes)

Run before ship. Blocks on any HIGH or >2 LOW.

| Pass | Status | Notes |
|---|---|---|
| 1. Patch idempotency | NONE | Both .mjs patches: pre-check before mutating, fail-loud on missing anchors, atomic writes. |
| 2. Type safety + braces | NONE | All 4 .tsx files balanced. No `any`, no `as` assertions, default exports, standard imports. |
| 3. Cross-tenant safety | LOW | N/A for frontend, but AuthGate inheritance is assumed (new routes inside same Switch as `/campaigns`). Manual test verifies. |
| 4. Defect-log adherence | NONE | All cumulative defects N/A for this bundle. |
| 5. Migration safety | **MEDIUM** | New `/prospect/whatsapp` (singular) and old `/prospects` (plural) coexist. SDRs typing URLs by hand could mis-route. Resolves when 2.3 retires the old "Prospects" nav. Window: 1-3 tickets. |
| 6. Naming consistency | NONE | URL ↔ component ↔ file ↔ label consistent across all 4 new pages. |
| 7. Documentation | NONE | This section + manual test + scope/migration in README all present. |

**Verdict**: 0 HIGH, 1 MEDIUM, 2 LOW. Ships.

The MEDIUM is documented as a known transient issue. Mitigation: SDRs navigate via the sidebar, not by typing URLs. The old "Prospects" nav item retires in 2.3 (when WhatsApp prospect page goes live).

## Defect-log status

No new defects. All from prior bundles still apply (root typecheck, vite HMR for frontend, anchored idempotent patches, β-pattern).

## Next

After 2.0-FE goes green, the order is:
1. **2.1-BE** — URL resolver service (Play Store / App Store / website → brand domain).
2. **2.2-BE** — Discovery endpoint (multi-company `api_search` with `has_direct_phone === "Yes"` filter).
3. **2.3-FE** — Wire the Prospect: WhatsApp page to the new endpoints. Replaces the placeholder.

2.1 and 2.2 are pure backend, can ship in either order or in parallel. 2.3 depends on both.
