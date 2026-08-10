-- BS Tech Limited — Survey Work
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run

-- Users (workers + admin)
create table if not exists users (
  user_id text primary key,
  password text not null,
  name text not null,
  role text not null check (role in ('worker', 'admin')),
  created_at timestamptz not null default now()
);

-- 500 survey templates
create table if not exists templates (
  id text primary key,
  question text not null,
  options jsonb not null
);

-- Today's (or any day's) work queue per worker
create table if not exists daily_work (
  id bigserial primary key,
  work_date date not null,
  user_id text not null references users(user_id) on delete cascade,
  survey_count int not null default 0,
  generated_at timestamptz,
  last_submitted_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  unique (work_date, user_id)
);

-- History of completed / partial days per user
create table if not exists completions (
  id bigserial primary key,
  user_id text not null references users(user_id) on delete cascade,
  work_date date not null,
  total int not null default 0,
  completed_count int not null default 0,
  status text not null default 'assigned',
  completed_at timestamptz,
  generated_at timestamptz,
  unique (user_id, work_date)
);

create index if not exists idx_daily_work_date on daily_work (work_date);
create index if not exists idx_completions_user on completions (user_id);

-- Default accounts (same as before)
insert into users (user_id, password, name, role) values
  ('user1', 'pass123', 'Alex Worker', 'worker'),
  ('admin', 'admin123', 'Site Admin', 'admin')
on conflict (user_id) do nothing;

-- Server-only access via SUPABASE_SERVICE_ROLE_KEY (browser never hits Supabase).
-- Keep RLS OFF so seed + API inserts work with service_role (and avoid accidental anon lockouts).
alter table users disable row level security;
alter table templates disable row level security;
alter table daily_work disable row level security;
alter table completions disable row level security;
