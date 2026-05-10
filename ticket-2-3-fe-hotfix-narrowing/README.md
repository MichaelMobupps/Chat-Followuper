# Ticket 2.3-FE hotfix — TS2339 narrowing fix

Single one-line patch on top of the 2.3-FE bundle that fixed the
TypeScript error blocking apply.sh at step 6 (dashboard typecheck).

## What broke

`useWhatsappLink` is declared with `useMutation<WhatsappLinkResponse,
ApiError, string>` so its onError handler receives `err: ApiError`.
The original code in `BulkResults.tsx` did:

```ts
const msg =
  err instanceof ApiError
    ? `${err.code ?? err.message}`
    : err.message;        // ← TS2339: err is `never` here
```

Since TError is statically `ApiError`, the `instanceof` narrowing makes
the else branch `never`. TS rejects `.message` on `never`.

## What this fixes

Drops the unreachable narrowing. The simplified code uses
`err.code ?? err.message` directly:

```ts
const msg = err.code ?? err.message;
```

This matches the convention used elsewhere in the codebase (e.g.
`hooks/use-apollo.ts` consumers) where mutations declare ApiError as
TError and consumers trust the type.

The page orchestrator's try/catch in `pages/prospect/whatsapp.tsx`
(processOne) keeps its multi-branch `instanceof` narrowing because
that's a real catch where err is genuinely `unknown` — different
context.

## How to ship

```bash
chmod +x ticket-2-3-fe-hotfix-narrowing/apply.sh
ticket-2-3-fe-hotfix-narrowing/apply.sh
# Then restart the dashboard workflow
```

## Replit Agent prompt

```
Apply ticket-2-3-fe-hotfix-narrowing from the uploaded zip. This is
a one-line TS2339 fix in BulkResults.tsx that was blocking the main
2.3-FE apply.sh at step 6 (dashboard typecheck).

Steps:

1. Unzip.
   Command: rm -rf ticket-2-3-fe-hotfix-narrowing && unzip -o ticket-2-3-fe-hotfix-narrowing.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-2-3-fe-hotfix-narrowing/apply.sh

3. Run apply.sh.
   Command: ticket-2-3-fe-hotfix-narrowing/apply.sh

   This patches BulkResults.tsx (one anchored edit), runs dashboard
   typecheck, dashboard build, source-code sync. Idempotent.

4. After apply.sh exits 0, restart the dashboard workflow.

5. Open /prospect/whatsapp in browser. Confirm the new bulk UI
   renders (not the placeholder text).

6. Walk through scenarios 1-7 in docs/manual-test-2-3-fe.md (the
   no-credit-cost scenarios from the main 2.3-FE bundle).

7. Report back:
   - apply.sh exit code + last 10 lines
   - dashboard typecheck output
   - First-render result for /prospect/whatsapp
   - Manual test 1-7 pass count

8. Do NOT republish to prod. Do NOT run scenarios 8-12 (credit-spending)
   yet. Wait for Michael's go-ahead.
```

## Idempotency

Marker check uses the unique comment text added by the patch. Re-runs
SKIP. Verified in the dry-run output below.
