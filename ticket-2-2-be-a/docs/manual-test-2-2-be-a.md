# Manual test — Ticket 2.2-BE-A (Sonnet company disambiguation)

The integration test covers auth/validation and one happy-path Sonnet call. This manual test exercises the **disambiguation cases** that are the whole reason this endpoint exists — name collisions, subsidiaries, dev≠brand, non-Latin names. The integration test can't cover these without burning many Sonnet credits per CI run; manual is the right shape.

Cost: each curl below burns ~$0.005-0.01 in Sonnet credits. Plan for ~$0.10 to walk the full doc.

## Pre-flight

- [ ] api-server workflow restarted after apply.sh.
- [ ] `ANTHROPIC_API_KEY` is set as a Replit Secret on both workspace and deploy.
- [ ] Integration test passed: `node /tmp/integration-2-2-be-a-resolve-company.mjs` → `[PASS]`.
- [ ] Sign in via `/login`, copy `cf_session` from DevTools → Application → Cookies.

## The shape you're testing against

Route: `POST /api/prospector/resolve-company`

Request body (all fields optional, but at least one of `brand`, `appName`, `domain` required):
```json
{
  "brand": "string|null",
  "appName": "string|null",
  "domain": "string|null",
  "country": "string|null",
  "description": "string|null",
  "developerEmail": "string|null",
  "developerLegalName": "string|null",
  "storeUrl": "string|null",
  "storeCategory": "string|null",
  "publisherContactEmails": "string|null",
  "sourceType": "play_store|app_store|website|unknown|null"
}
```

Response (200 OK):
```json
{
  "resolved": {
    "companyName": "string (Latin script, direct publisher not parent)",
    "parentCompany": "string (empty if companyName is top-level)",
    "corporateDomain": "string",
    "alternativeDomains": ["string"],
    "searchQueries": ["string", "string", "..."],
    "isMultinational": false,
    "focusMarket": "string (multinational only)",
    "primaryMarket": "string (HQ country)",
    "reasoning": "string"
  },
  "latencyMs": 4321
}
```

Errors:
- `400 invalid_body` — zod validation failure
- `502 resolver_failure` — LLM returned non-JSON or missing fields after retries
- `504 resolver_timeout` — Sonnet didn't respond within 90s

## Helper

```bash
COOKIE="cf_session=...your.session.cookie..."
RESOLVE() {
  curl -s -X POST "http://localhost:80/api/prospector/resolve-company" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -d "$1" | python3 -m json.tool
}
```

## Case 1: Probo (sanity — same as integration test)

```bash
RESOLVE '{
  "brand": "Probo",
  "appName": "Probo: Trade Anything With Opinions",
  "domain": "probo.in",
  "country": "IN",
  "sourceType": "play_store"
}'
```

Expected:
- [ ] `companyName` contains "Probo"
- [ ] `corporateDomain` is "probo.in" (or near variant)
- [ ] `primaryMarket` is "India"
- [ ] `searchQueries` contains "Probo" and at least one Latin variant
- [ ] `parentCompany` may be empty or "Probo Media Technologies"

## Case 2: Cash App → Block, Inc.

The signature dev-domain-vs-company-name case. cash.app is the product, Block is the company.

```bash
RESOLVE '{
  "brand": "Cash App",
  "appName": "Cash App",
  "domain": "cash.app",
  "country": "US",
  "sourceType": "app_store"
}'
```

Expected:
- [ ] `companyName` is "Block, Inc." or "Block" (NOT "Cash App", NOT "Square")
- [ ] `corporateDomain` is "block.xyz" or "squareup.com" (NOT "cash.app")
- [ ] `cash.app` is in `alternativeDomains`
- [ ] `searchQueries` contains "Block" and likely "Square"
- [ ] `isMultinational` is true
- [ ] `primaryMarket` is "United States"

## Case 3: Astrum game → Astrum Entertainment + VK as parent

Tests the "direct publisher, not ultimate parent" rule.

```bash
RESOLVE '{
  "brand": "Astrum Entertainment",
  "appName": "Мир домовят",
  "domain": "astrumgames.com",
  "country": "RU",
  "sourceType": "play_store"
}'
```

Expected:
- [ ] `companyName` is "Astrum Entertainment" (NOT "VK")
- [ ] `parentCompany` is "VK" or "VK Group"
- [ ] `searchQueries` contains BOTH "Astrum Entertainment" AND "VK" (per system prompt: "Include BOTH the direct publisher name AND the parent company name if different")

## Case 4: Emma fintech vs Emma mattress (collision)

Tests the disambiguation rule. Same brand, different industries.

**4a — Emma fintech:**
```bash
RESOLVE '{
  "brand": "Emma",
  "appName": "Emma — Budget Planner",
  "domain": "emma-app.com",
  "country": "GB",
  "description": "Emma helps you save, budget, and invest. Connect all your accounts in one place."
}'
```

Expected:
- [ ] `companyName` mentions Emma + finance signal ("Emma App", "Emma Finance Ltd")
- [ ] `corporateDomain` is "emma-app.com" (NOT "emma.com")
- [ ] `alternativeDomains` does NOT contain "emma.com" or "emma-sleep.com"

**4b — Emma mattress:**
```bash
RESOLVE '{
  "brand": "Emma",
  "appName": "Emma Sleep",
  "domain": "emma-sleep.com",
  "country": "DE",
  "description": "Discover the best mattresses, pillows and bedding for your sleep."
}'
```

Expected:
- [ ] `companyName` mentions Emma + sleep/mattress signal ("Emma Sleep", "Emma Sleep GmbH")
- [ ] `corporateDomain` is "emma-sleep.com" or "emma-mattress.com" (NOT "emma-app.com")
- [ ] `alternativeDomains` does NOT contain "emma-app.com"

## Case 5: SMBC Consumer Finance → SMBC Group as parent

Subsidiary of a major banking group.

```bash
RESOLVE '{
  "brand": "SMBC",
  "appName": "Promise Mobile",
  "domain": "promise.co.jp",
  "country": "JP",
  "description": "Personal loan service from Promise, an SMBC Consumer Finance company."
}'
```

Expected:
- [ ] `companyName` is "SMBC Consumer Finance" or "Promise"
- [ ] `parentCompany` is "SMBC Group" or "Sumitomo Mitsui Financial Group"
- [ ] `corporateDomain` is "smbc.co.jp" or similar
- [ ] `primaryMarket` is "Japan"

## Case 6: Non-Latin name (Russian / Cyrillic) → Latin alternatives in queries

Tests the post-processing rule: if `companyName` is non-Latin, `searchQueries` gets Latin alternatives appended.

```bash
RESOLVE '{
  "brand": "ВКонтакте",
  "appName": "ВК",
  "domain": "vk.com",
  "country": "RU"
}'
```

Expected:
- [ ] `companyName` is in Latin script ("VK" or "VK Group", per system prompt: "NEVER return names in Cyrillic or other non-Latin scripts")
- [ ] `searchQueries` includes at least one of "VK", "VKontakte", "VK Group"

## Case 7: Tiny website-only brand (low-context)

Stress test — minimal context, just a domain.

```bash
RESOLVE '{
  "brand": null,
  "appName": null,
  "domain": "casualino.com",
  "country": null,
  "sourceType": "website"
}'
```

Expected:
- [ ] `companyName` mentions Casualino
- [ ] `corporateDomain` is "casualino.com"
- [ ] No crash even with mostly-null input
- [ ] `reasoning` acknowledges the thin context

## Case 8: Multinational with regional focus

Tests `isMultinational` + `focusMarket` + `primaryMarket`.

```bash
RESOLVE '{
  "brand": "Grupo Dia",
  "appName": "Club Dia España",
  "domain": "dia.es",
  "country": "ES",
  "description": "Loyalty program for Dia supermarkets in Spain."
}'
```

Expected:
- [ ] `isMultinational` is true
- [ ] `focusMarket` is "Spain" (this app instance)
- [ ] `primaryMarket` is "Spain" (HQ in Madrid)
- [ ] `companyName` is "Grupo Dia" or "Dia"
- [ ] `searchQueries` contains both "Dia" and "Grupo Dia"

## Pass criteria summary

| Case | What's being tested | Pass condition |
|------|---|---|
| 1 | Sanity / Probo | companyName mentions Probo, primaryMarket=India |
| 2 | Cash App → Block | companyName=Block, corporateDomain=block.xyz |
| 3 | Direct publisher rule | companyName=Astrum Entertainment, parentCompany=VK |
| 4a/b | Disambiguation collision | Industry-correct domain picked, wrong-industry domain absent from alts |
| 5 | Subsidiary → parent | parentCompany=SMBC Group |
| 6 | Non-Latin → Latin alts | searchQueries has at least one Latin variant |
| 7 | Thin context | Doesn't crash; reasoning acknowledges sparse input |
| 8 | Multinational | isMultinational=true; primaryMarket=HQ country |

If any case fails, paste the case number and the full JSON response. The `reasoning` field shows the LLM's logic — that's the first place to look when something's off.

## Acceptable variation

- Sonnet picks a slightly different but still-correct company name (e.g. "Block" vs "Block, Inc.") — both are fine, downstream `find_org` (2.2-BE-B) handles legal-suffix stripping.
- `searchQueries` ordering varies. As long as the right names are present, the order doesn't matter.
- `reasoning` wording varies run-to-run. Don't assert exact strings.

## Performance

- [ ] Each call returns in 3-8 seconds (Sonnet typical).
- [ ] No 504 timeouts in normal usage. If you see one, the network or Anthropic side is slow — retry.
- [ ] No unhandled promise rejections in api-server logs.

## Action log inspection

After running the cases above:

```bash
psql "$DATABASE_URL" -c \
  "SELECT
     metadata->>'brand' AS brand,
     metadata->>'resolved_company' AS resolved,
     metadata->>'parent_company' AS parent,
     metadata->>'is_multinational' AS multi,
     metadata->>'llm_latency_ms' AS latency,
     action_status,
     duration_ms
   FROM action_logs
   WHERE action_type = 'prospector.company_resolved'
   ORDER BY executed_at DESC LIMIT 10;"
```

Spot-check that brand, resolved_company, parent_company match what came back in the response.

## If anything fails

Paste:
1. The case number that failed
2. The full JSON response (especially `reasoning`)
3. The metadata row from the action log query above

Most failures will be Sonnet picking a wrong-but-close company. The `reasoning` field tells you why.
