-- Audit-2 F4/D2 — cancel legacy teams/slack followups (prod one-time cleanup)
--
-- Teams and Slack were removed as channels (commit 996f1f9). Any followup rows
-- created on those channels BEFORE the removal are now zombies: they can never
-- complete (message generation throws invalid_channel), they are invisible in
-- the whatsapp|telegram-only management UI, and — until the app-side guard in
-- this same audit shipped — they were re-listed in every daily digest / noon
-- pushover / priority-1 overdue escalation with a dead link, forever.
--
-- The app now filters them out of every due query (belt), but this SQL actually
-- retires the rows (braces) so they stop counting as "scheduled" anywhere.
--
-- READ-ONLY check first (how many exist on prod — dev has zero):
--   SELECT channel, count(*) FROM followups
--   WHERE channel NOT IN ('whatsapp','telegram') AND sent_at IS NULL
--   GROUP BY channel;
--
-- Idempotent + safe to re-run (only touches not-yet-sent, non-live-channel rows):
UPDATE followups
   SET status = 'cancelled'
 WHERE channel NOT IN ('whatsapp', 'telegram')
   AND sent_at IS NULL
   AND status <> 'cancelled';

-- Optional cosmetic: reset any user default / campaign default still pointing at
-- a removed channel so the FE selectors don't show an unsupported value.
-- UPDATE users SET preferred_channel = 'whatsapp'
--  WHERE preferred_channel NOT IN ('whatsapp','telegram');
-- UPDATE campaigns SET default_channel = 'whatsapp'
--  WHERE default_channel NOT IN ('whatsapp','telegram');
