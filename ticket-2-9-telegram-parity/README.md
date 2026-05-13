# ticket-2-9-telegram-parity (rescue build)

Rescue build for the workspace state where an earlier 2.9 frontend patch partially landed before dashboard typecheck failed.

This build is designed to apply against either:

1. clean post-2.7 FE/BE state, or
2. partial 2.9-v1 state where `pages/followup/telegram.tsx` exists and `ChannelFollowupPage.tsx` already contains `<ManualContactsSection channel={channel} />`.

It fixes two bundle-level issues in the previous zip:

- `apply.sh` no longer requires the new `telegram.tsx` page to already exist before copying it.
- the ChannelFollowupPage patch no longer treats the bare `<ManualContactsSection channel={channel} />` line as success; it wraps the render in a WhatsApp/Telegram type guard.

It also adds the missing BE follow-up route fallback so Telegram prospects created with an E.164 phone can use the phone-based `t.me/+<phone>` deep-link path instead of failing with `no_telegram_handle`.

No schema migration is included.
