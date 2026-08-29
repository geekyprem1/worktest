-- BS Tech Limited — Form Fill task type migration
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run
-- (For existing databases that already ran schema.sql)

-- 500 form-fill templates (dummy application forms)
create table if not exists form_templates (
  id text primary key,
  title text not null,
  description text,
  fields jsonb not null
);

-- Daily batch type: 'survey' (default, existing rows) or 'form'
alter table daily_work
  add column if not exists work_type text not null default 'survey';

alter table form_templates disable row level security;
