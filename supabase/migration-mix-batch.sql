-- BS Tech Limited — Mix Batch support migration
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run
-- (For existing databases that already ran schema.sql + migration-form-tasks.sql)

-- Per-type item counts on the daily batch.
-- survey_count already exists from schema.sql; we just add form_count.
alter table daily_work
  add column if not exists form_count int not null default 0;
