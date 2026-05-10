# Hotfix: discovery hang on bulk WhatsApp prospect flow

The `/prospect/whatsapp` page hung indefinitely on "Resolving URL" after
clicking Discover. BE responded successfully (200 in 376ms per logs), but
the FE silently did nothing with the response.

## Root cause

FE/BE wire-format drift in `POST /api/prospector/resolve-urls`.

| FE type said | BE actually returned |
| --- | --- |
| `resolutions: ResolvedUrl[]` | `resolved: ResolvedUrl[]` ← **the hang** |
| `kind?` (per item) | `type?` |
| `appId?` (per item) | `appName?` |
| (missing) | `country?` |

The wrapper-key mismatch was the operational bug. Consumer code:
```ts
resolutions = r.resolutions;   // undefined at runtime
// ...
for (const r of resolutions)   // TypeError: undefined is not iterable
  byUrl.set(r.url, r);
```

This throw was outside the try/catch (which only wrapped the `await`),
so it became an unhandled promise rejection. `runDiscovery` was launched
with `void runDiscovery(input)`, so the rejection had no surface. State
had already been set to "resolving"; UI stayed stuck there.

TypeScript didn't catch it because the FE type definitions were
hand-written and matched the consumer code (both said `resolutions`),
even though both disagreed with the BE.

## Fix

Two anchored patches:

1. **`lib/api/prospector.ts`** — full alignment with BE shape
   - `resolutions` → `resolved`
   - `kind` → `type`
   - `appId` → `appName`
   - + `country?: string | null`

2. **`pages/prospect/whatsapp.tsx`** — consumer
   - `resolutions = r.resolutions` → `resolutions = r.resolved`
   - Local variable name kept as `resolutions` (just a name; no rename needed downstream)

Order matters: types first, consumer second. apply.sh enforces this.

## How to ship

```bash
chmod +x ticket-hotfix-discovery-hang/apply.sh
ticket-hotfix-discovery-hang/apply.sh
# Refresh dashboard tab — Vite HMR picks it up
# No api-server restart needed (FE only)
```

## Replit Agent prompt

```
Apply ticket-hotfix-discovery-hang from the uploaded zip. Single-purpose
hotfix: aligns FE prospector type with the actual BE response shape so
the bulk WhatsApp discover flow stops hanging on "Resolving URL".

Steps:

1. Unzip.
   Command: rm -rf ticket-hotfix-discovery-hang && \
            unzip -o ticket-hotfix-discovery-hang.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-hotfix-discovery-hang/apply.sh

3. Run apply.sh.
   Command: ticket-hotfix-discovery-hang/apply.sh

   4-step script: 2 anchored patches + dashboard typecheck + sync.
   Idempotent. NO api-server build needed (FE only).

4. After apply.sh exits 0, refresh the dashboard tab. Vite HMR picks
   up changes — no workflow restart needed.

5. Verify:
   - Open /prospect/whatsapp
   - Paste 1 URL (e.g., a Play Store URL)
   - Click Discover
   - Should advance: "Resolving URL" → "Searching org" →
     "Searching people" → candidate grid visible
   - If still hangs: open devtools console (F12), copy any errors,
     and paste them — there may be a second-order bug downstream

6. Report back:
   - apply.sh exit code + last 10 lines
   - dashboard typecheck output
   - Whether discover advances past "Resolving URL"
   - If yes: how many candidates appeared
   - If no: console errors

7. Do NOT republish to prod yet.

Hammer-vs-nail: do not modify any source files yourself.
```

## Defect #14 logged

**FE/BE response shape can drift silently when types are hand-written on
both sides.** Pre-build checklist: when patching/extending API surfaces,
diff the BE handler's response construction against the FE type by hand.
Long-term fix: codegen FE types from BE Zod schemas (out of scope here;
backlog).

## Limitations of this hotfix

- This fixes ONLY the wire-format mismatch on resolve-urls. If there's
  another mismatch on `/api/apollo/search-org` or `/api/apollo/search-people`
  (the next steps in the pipeline), the discovery will hang at THAT step
  instead. Fix-on-encounter — paste the next error/network response and
  we hotfix that too.
- This does NOT address the other 3 issues (state persistence on nav,
  real-time logs, title list parity). Those are separate tickets after
  the hang is verified gone.
