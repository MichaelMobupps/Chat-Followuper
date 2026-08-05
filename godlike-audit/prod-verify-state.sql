-- ===========================================================================
-- VERIFY prod state after (attempted) prod-bring-to-head runs. READ-ONLY.
-- Single SELECT — renders fine in the Replit SQL Console even when
-- multi-statement batches trip the driver ("Invalid response from Replit
-- driver"). Run this FIRST after any error: statements before the failure
-- may have applied (every statement is idempotent, so re-running chunks is
-- always safe).
--
-- Reading the output: every row must show ok = true; a false row names exactly what is missing.
--   expected = 'present' → the column/index/table must exist
--   expected = 'absent'  → 0016 drops it / legacy index must be gone
-- ===========================================================================
SELECT ord, object, expected, ok FROM (
  -- columns that must EXIST
  SELECT 1 AS ord, 'users.pushover_user_key (col)'           AS object, 'present' AS expected,
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_user_key') AS ok
  UNION ALL SELECT 2, 'users.preferred_channel (col)', 'present',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='preferred_channel')
  UNION ALL SELECT 3, 'users.pushover_quiet_hour_start (col)', 'present',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_quiet_hour_start')
  UNION ALL SELECT 4, 'users.pushover_quiet_hour_end (col)', 'present',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_quiet_hour_end')
  UNION ALL SELECT 5, 'users.message_template (col)', 'present',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='message_template')
  UNION ALL SELECT 6, 'daily_usage.pushover_sent (col)', 'present',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='daily_usage' AND column_name='pushover_sent')
  -- FK covering indexes
  UNION ALL SELECT 7,  'prospects_campaign_id_idx (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_campaign_id_idx')
  UNION ALL SELECT 8,  'action_logs_prospect_id_idx (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='action_logs_prospect_id_idx')
  UNION ALL SELECT 9,  'action_logs_followup_id_idx (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='action_logs_followup_id_idx')
  UNION ALL SELECT 10, 'conversations_source_followup_id_idx (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='conversations_source_followup_id_idx')
  UNION ALL SELECT 11, 'oauth_nonces_user_id_idx (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='oauth_nonces_user_id_idx')
  -- followups uniqueness swap
  UNION ALL SELECT 12, 'followups_prospect_channel_stage_unique (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='followups_prospect_channel_stage_unique')
  UNION ALL SELECT 13, 'followups_prospect_stage_unique (OLD idx)', 'absent', NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='followups_prospect_stage_unique')
  -- identity uniques (0013 + 0017)
  UNION ALL SELECT 14, 'prospects_user_apollo_person_unique (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_user_apollo_person_unique')
  UNION ALL SELECT 15, 'prospects_user_telegram_unique (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_user_telegram_unique')
  UNION ALL SELECT 16, 'prospects_user_linkedin_unique (idx 0017)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_user_linkedin_unique')
  -- weekly digest unique (the statement Replit generated wrong)
  UNION ALL SELECT 17, 'action_logs_weekly_digest_week_uq (idx)', 'present', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='action_logs_weekly_digest_week_uq')
  -- 0015 drop
  UNION ALL SELECT 18, 'magic_link_tokens (table)', 'absent', NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='magic_link_tokens')
  -- 0016 drops
  UNION ALL SELECT 19, 'prospects_user_teams_unique (idx)', 'absent', NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_user_teams_unique')
  UNION ALL SELECT 20, 'prospects_user_slack_unique (idx)', 'absent', NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='prospects_user_slack_unique')
  UNION ALL SELECT 21, 'users.microsoft_refresh_token (col)', 'absent', NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='microsoft_refresh_token')
  UNION ALL SELECT 22, 'users.slack_bot_token (col)', 'absent', NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='slack_bot_token')
  UNION ALL SELECT 23, 'prospects.teams_email (col)', 'absent', NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='teams_email')
  UNION ALL SELECT 24, 'prospects.slack_user_id (col)', 'absent', NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='slack_user_id')
  -- 0018 columns
  UNION ALL SELECT 25, 'users.pushover_hour_local (col 0018)', 'present', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_hour_local')
  UNION ALL SELECT 26, 'users.pushover_days (col 0018)', 'present', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pushover_days')
  UNION ALL SELECT 27, 'users.digest_days (col 0018)', 'present', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='digest_days')
) checks
ORDER BY ord;
