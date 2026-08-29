-- BS Tech Limited — Per-worker task assignment migration
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run

-- Per-worker task assignment preferences
create table if not exists user_task_settings (
  user_id text primary key references users(user_id) on delete cascade,
  task_mode text not null default 'survey',  -- 'survey' | 'form' | 'mix'
  survey_count int not null default 50,
  form_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_task_settings disable row level security;
