Chat Followuper - Follow-up reminder digest (api-server only)  [v2, godlike-audited]
====================================================================================

A daily email per rep listing their due follow-ups. Each item links to a
token-authenticated open route that resolves the current wa.me or t.me deep
link and 302-redirects the rep into the chat to press send. No automation and
no bulk send. The rep is always the sender.

PREREQUISITE
  Apply the reveal-expiry bundle first. This bundle adds the digest script
  next to sweepReveals.ts in build.mjs, so that entry must already be there.

WHAT THIS BUNDLE CHANGES (api-server only)
  edited:
    src/routes/index.ts   registers the open route
    build.mjs             adds the digest script as a build entry
  new files:
    src/lib/followupLinkToken.ts    HMAC mint/verify for open links
    src/services/mailer.ts          nodemailer SMTP to one Workspace mailbox
    src/services/followupDigest.ts  composer: due follow-ups per rep, deduped
    src/routes/followupOpen.ts      token-auth open route -> 302 to deep link
    src/scripts/sendFollowupDigests.ts  scheduled entry
  dependency:
    nodemailer (+ @types/nodemailer). apply.sh adds and installs it.
    nodemailer is already in the esbuild external list, so no build edit.

AUDIT OUTCOME (v2)
  Verified against the live schema and proven call sites: every prospect,
  followup, users, daily_usage, and action_logs column name is correct; the
  daily_usage upsert and the action_logs insert match existing call sites;
  ACTION_TYPES.digestSent and daily_usage.digest_sent already exist; the open
  route GET /followups/open/:id cannot be shadowed by any existing followups
  route. This bundle adds no database exports, so the db package needs no
  rebuild.

  Two fixes applied in v2:
  1. The composer now wraps each rep in its own error boundary, so one failed
     recipient or SMTP error no longer aborts the run. The script logs
     usersFailed alongside usersEmailed.
  2. The open route now wraps the whole handler and falls back to the
     dashboard on any error, including a missing FOLLOWUP_LINK_SECRET, and
     sets Referrer-Policy: no-referrer so the signed token is not leaked to
     WhatsApp or Telegram through the Referer header.

DESIGN CHOICES
  - Due = scheduled, unsent, past scheduledAt, has a generated message, and
    the prospect is neither paused nor replied. Non-actionable items are left
    out of the email rather than linking to a broken chat.
  - Open links are stateless HMAC tokens bound to one follow-up and its owner,
    14-day TTL by default (FOLLOWUP_LINK_TTL_HOURS overrides).
  - One digest per rep per day, deduped via daily_usage.digestSent, logged as
    the digest.sent action. Email is sent before the flag is set, so a partial
    failure retries next run rather than dropping silently.
  - The open route falls back to the dashboard follow-up page for any expired,
    replied, paused, geo-blocked, or unresolved case.

ENV TO PROVISION (the actual blocker)
  SMTP_USER             the sending mailbox, e.g. followups@mobupps.com
  SMTP_PASS             a 16-char app password for that mailbox (2FA on)
  FOLLOWUP_FROM         optional display From; defaults to SMTP_USER.
                        Gmail rewrites or rejects a From that the mailbox is
                        not authorized to send as, so keep this equal to
                        SMTP_USER or configure it as a verified send-as alias.
  FOLLOWUP_LINK_SECRET  random secret for signing open links
  APP_PUBLIC_URL        e.g. https://chat-followuper.replit.app
  optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 587),
            FOLLOWUP_LINK_TTL_HOURS (default 336)

RUN (from your monorepo root)
  bash cf-followup-digest/apply.sh

  apply.sh adds nodemailer, then runs the api-server typecheck and build.
  Set SKIP_BUILD=1 to apply and typecheck without building.

VERIFIED HERE
  The two wiring edits matched the live api-server tree (with the reveal
  bundle applied) and are idempotent. Typecheck and the nodemailer install
  run on your side, since node_modules is not in the upload.

AFTER APPLY (separate steps)
  1. Set the env above on the deployment.
  2. Scheduled Deployment at: node dist/scripts/sendFollowupDigests.mjs, daily.
  3. Restart, then Republish.
