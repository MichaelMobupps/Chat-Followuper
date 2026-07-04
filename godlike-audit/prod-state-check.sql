-- Read-only production state check. Changes nothing. Reports whether each object
-- the deploy wants to create/drop already exists, so we can see why Replit's
-- generated migration is being rejected.
SELECT 'magic_link_tokens table still exists'                       AS what,
       (to_regclass('public.magic_link_tokens') IS NOT NULL)::text  AS answer
UNION ALL SELECT 'OLD index followups_prospect_stage_unique exists',
       (to_regclass('public.followups_prospect_stage_unique') IS NOT NULL)::text
UNION ALL SELECT 'NEW index followups_prospect_channel_stage_unique exists',
       (to_regclass('public.followups_prospect_channel_stage_unique') IS NOT NULL)::text
UNION ALL SELECT 'users.pushover_user_key column exists',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_user_key')::text
UNION ALL SELECT 'users.preferred_channel column exists',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='preferred_channel')::text
UNION ALL SELECT 'users.message_template column exists',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='message_template')::text
UNION ALL SELECT 'daily_usage.pushover_sent column exists',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='daily_usage' AND column_name='pushover_sent')::text
UNION ALL SELECT 'action_logs_weekly_digest_week_uq index exists',
       (to_regclass('public.action_logs_weekly_digest_week_uq') IS NOT NULL)::text
UNION ALL SELECT 'prospects_user_apollo_person_unique index exists',
       (to_regclass('public.prospects_user_apollo_person_unique') IS NOT NULL)::text
UNION ALL SELECT 'prospects_user_telegram_unique index exists',
       (to_regclass('public.prospects_user_telegram_unique') IS NOT NULL)::text;
