-- BS Tech Limited — Admin controls migration
-- Adds: user ban flag, and per-worker allowed form templates.
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run.

-- 1) Ban / disable a user (banned users cannot log in)
alter table users
  add column if not exists banned boolean not null default false;

-- 2) Per-worker allowed form template ids.
--    When set (non-empty), the worker's form tasks are drawn ONLY from these ids.
--    When null/empty, all form templates are eligible (previous behaviour).
alter table user_task_settings
  add column if not exists form_template_ids jsonb not null default '[]'::jsonb;

-- 3) Multi-select task types per worker.
--    A worker can be assigned any combination of 'survey' / 'form' / 'mix'.
--    task_modes is the new source of truth; task_mode is kept for back-compat.
alter table user_task_settings
  add column if not exists task_modes jsonb not null default '[]'::jsonb;

-- Backfill task_modes from the existing single task_mode where empty.
update user_task_settings
set task_modes = jsonb_build_array(task_mode)
where (task_modes is null or task_modes = '[]'::jsonb)
  and task_mode is not null;
