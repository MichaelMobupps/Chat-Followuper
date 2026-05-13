# ticket-2-9-telegram-parity

Telegram channel parity for manual contact ingest. Bundles three prior queue items into one ship cycle:

| Sub-ticket | Scope |
|---|---|
| **2-6-fe** | Replace `/followup/telegram` placeholder with the live `ChannelFollowupPage` wrapper. |
| **2-9-be** | Allow `channel: "telegram"` in the manual-ingest handler. Accept either E.164 phone or `@handle` as the identifier. Teach `services/channels/telegram.ts generateLink` to build phone-based `t.me/+<phone>` links. |
| **2-9-fe** | Remove the WhatsApp-only gate on `<ManualContactsSection>`. Make `AddManualContactDialog` channel-aware (description, label, placeholder, validation hint). Surface `duplicate_telegram_handle` error. |

## What ships

- **One new file:** `artifacts/dashboard/src/pages/followup/telegram.tsx` (4-line wrapper mirroring `whatsapp.tsx`).
- **Five idempotent patches:**
  - `01-be-prospects-route-telegram.js` — channels constant + handler refactor in `routes/prospects.ts`.
  - `02-be-telegram-generatelink-phone.js` — phone-aware `generateLink` in `services/channels/telegram.ts`.
  - `03-fe-manual-ingest-client-telegram.js` — extends `MANUAL_INGEST_CHANNELS` in the dashboard's API client.
  - `04-fe-channel-page-remove-gate.js` — drops `channel === "whatsapp" && (...)` gate.
  - `05-fe-dialog-channel-aware.js` — channel-aware copy/validation/error handling in the dialog.

## What does NOT ship

- **No schema changes.** `prospects.telegram_handle` is a pre-existing nullable text column.
- **No new ACTION_TYPES.** The existing `manualIngestSingle` entry carries `channel` in its metadata, and this bundle adds `identifierKind: "phone" | "telegram_handle"` so audit queries can distinguish the two Telegram storage paths.
- **No deployment-side schema apply needed.** Schema is unchanged. Redeploy alone is sufficient to propagate code to the live site (no `drizzle-kit push` step against the deployment DB).

## API surface delta

| Method | Path | Change |
|---|---|---|
| POST | `/api/prospects/manual-ingest` | Body accepts `channel: "telegram"` (was: `"whatsapp"` only). For Telegram, the `phone` field accepts either E.164 phone or `@handle`. New error code: `409 duplicate_telegram_handle`. |
| PATCH | `/api/users/me/manual-ingest-settings` | Same shape; `channel: "telegram"` is now accepted in the body. |
| GET | `/api/users/me/manual-ingest-settings` | Unchanged. |

## Telegram identifier rules

- **Phone path:** raw E.164 (`+972547734033`). Stored in `prospects.phone`. Dedupe uses the existing `(user_id, phone)` unique index.
- **Handle path:** Telegram username, 5-32 chars `[a-zA-Z0-9_]`, optional leading `@` (stripped on storage). Stored in `prospects.telegram_handle`. Dedupe via explicit pre-check (no unique index yet — small race window, can be hardened in a follow-on if real volume demands it).
- **Deep-link shape:** `t.me/+<phone>` or `t.me/<handle>`. The leading `+` is preserved verbatim in the phone path (Telegram client requires it; RFC 3986 allows it).

## Run

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o ticket-2-9-telegram-parity.zip
bash ticket-2-9-telegram-parity/apply.sh
```

Then `restart_workflow` and paste the log here for verification. See apply.sh's footer for the smoke probe steps and visual smoke checklist.
