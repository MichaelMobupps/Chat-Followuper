# Manual test — Ticket 1.7-FE-B-2 (Apollo discovery)

This bundle adds the 3-stage Apollo picker as an overlay on the seeder form. Form pre-fills with discovered contact data; if Apollo doesn't return a phone, the SDR fills it manually.

## Pre-flight

- [ ] `APOLLO_API_KEY` is set in Replit secrets. Without it, all picker calls return 503.
- [ ] FE-B-1 is already applied (the seeder page uses its components).
- [ ] Sign in. Navigate to `/seeder`.

## Free path (no Apollo spend) — UI smoke test

The picker only consumes Apollo credits at the **reveal** step. Stages 1-3 (search-org, search-people) cost $0.

- [ ] On `/seeder`, you see the new "Discover via Apollo" card above the form, with an "Open Apollo picker" button.
- [ ] Click the button. Dialog opens with stage label "1. Find a company".
- [ ] Enter brand `Probo`. Optionally country `IN` and titles `UA Manager, Head of Growth`.
- [ ] Click "Search". Network: `POST /api/apollo/search-org` → 200 with `{orgs: [...]}`.
- [ ] Stage advances to "2. Pick an organization". List shows org cards with industry/employees/country/domain badges.
- [ ] Click an org. Network: `POST /api/apollo/search-people` → 200.
- [ ] Stage advances to "3. Pick a person". People list shows name + title + LinkedIn badge if present.
- [ ] Click "Back". Returns to org list.
- [ ] Click "Cancel". Dialog closes. Form is unchanged.

## Reveal flow (~$1 in Apollo credits per reveal — costs real money)

- [ ] Open picker again. Brand `Probo`, country `IN`. Search.
- [ ] Pick the most recognizable org from the list.
- [ ] Pick a person — ideally one that has LinkedIn (the LinkedIn badge is a hint Apollo has good data).
- [ ] Stage 4 ("Confirm reveal"). Card shows the person + org. Yellow warning banner notes the credit cost.
- [ ] Click "Reveal contact". Network: `POST /api/apollo/reveal` → 200.
- [ ] Stage 5 ("Reveal complete"). Phone, email, LinkedIn rendered. Phone may say "Not available" with a yellow warning banner.
- [ ] Click "Use this contact". Dialog closes. Toast "Form pre-filled from Apollo". Blue banner "Form pre-filled from Apollo" appears above the form.
- [ ] Form fields show: phone (if Apollo had it), prospectName, brand, country (only if Apollo returned a 2-letter ISO).

## Submit pre-filled

- [ ] If phone wasn't returned: type it manually in E.164 format.
- [ ] Fill any remaining required fields (subVertical, product).
- [ ] Submit "Save & start research".
- [ ] Network: `POST /api/prospects` body includes `sourceMode: "apollo"`, `apolloPersonId`, `apolloOrgId`.
- [ ] Research stream begins. Continue through brief + message as in FE-B-1.

## "Clear" pre-fill

- [ ] After Apollo pre-fill, click "Clear" on the blue banner.
- [ ] Form remounts blank. Banner disappears.
- [ ] Submit a manually filled form. Network: `POST /api/prospects` body has `sourceMode: "manual"`, no `apolloPersonId`/`apolloOrgId`.

## Error paths

### Missing APOLLO_API_KEY
- [ ] If the secret isn't set: search returns 503 with `error: "apollo_not_configured"`. The picker's error banner shows the message.
- [ ] User can close the dialog without consuming any credits.

### Empty org search
- [ ] Search a nonsense brand (e.g. `xqzqzqxqzq`). Stage advances to org list with empty state: "No organizations found for...".
- [ ] Back button works. Cancel button works.

### Geo-blocked phone
- [ ] If Apollo returns a phone in a country outside the geo-gate allow-list (e.g. an unsupported region), the reveal returns 422 `geo_blocked`. The picker shows the error banner. No prospect is created (we never got past reveal).
- [ ] Apollo charged the credit anyway — that's the documented behavior of the api-server's reveal handler (geo gate runs after reveal).

## Combined: full Apollo → research → message → done

The most expensive but most valuable test: ~$1 (Apollo) + $0.20-$0.40 (research + message) per cycle.

- [ ] Open picker. Brand `Probo`, country `IN`, title `UA Manager`.
- [ ] Pick org → pick person → reveal → use contact.
- [ ] Pre-filled form: phone, name, brand. Fill subVertical (`real_money_gaming`) and product (`opinion-trading app`).
- [ ] Optionally attach a campaign.
- [ ] Submit. Watch network: `POST /api/prospects` (sourceMode=apollo, apolloPersonId set).
- [ ] Research streams. Brief renders. Save. Message generates. Done.
- [ ] On the Done card, click "View campaign" if attached. Verify prospect-count incremented.

## Console

- [ ] No red errors during normal use.
- [ ] No "Cannot read properties of null/undefined" in the picker (Apollo returns lots of `null` fields and the UI must handle them all).

## Known limitations (carried forward from FE-B-1)

- Edits to the generated message body don't persist (still queued for a future ticket).
- No Prospects detail page yet.

## Out of scope for FE-B-2

- **Async phone reveal** (`POST /api/apollo/request-phone-reveal`). When Apollo doesn't return a phone in the initial reveal, the SDR fills manually. Async reveal would need a "phone arrived" notification path which doesn't exist yet — out of scope.
- **Title autocomplete or suggestion**. Comma-separated string input is the v1.

---

## If anything fails

Paste:
1. Stage where it broke + the dialog's stage label
2. Network tab: method, URL, status, response body for the failing call
3. Console errors
4. The yellow/red banner text if shown
