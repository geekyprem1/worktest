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

-- 500 form-fill templates (dummy application forms)
create table if not exists form_templates (
  id text primary key,
  title text not null,
  description text,
  fields jsonb not null
);

-- Per-worker task assignment preferences
create table if not exists user_task_settings (
  user_id text primary key references users(user_id) on delete cascade,
  task_mode text not null default 'survey',
  survey_count int not null default 50,
  form_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Today's (or any day's) work queue per worker
create table if not exists daily_work (
  id bigserial primary key,
  work_date date not null,
  user_id text not null references users(user_id) on delete cascade,
  survey_count int not null default 0,
  work_type text not null default 'survey',
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

-- Site notices / Worker promo banner & notice page settings
create table if not exists site_notices (
  id text primary key default 'default',
  banner_enabled boolean not null default true,
  banner_image_url text default '/img/banner.jpg',
  title text not null default 'खास आपके लिए रोज कमाए ₹3000 तक',
  content text default 'BS Tech Limited के सभी वर्कर्स के लिए खास मौका!\n\n• घर बैठे काम करें\n• सुरक्षित और भरोसेमंद\n• कोई बड़ी इन्वेस्टमेंट नहीं\n• तुरंत पेमेंट सपोर्ट\n\nनीचे दिए गए लिंक पर क्लिक करके पूरी जानकारी प्राप्त करें और आज ही शुरू करें।',
  action_text text default 'यहां क्लिक करें',
  action_url text default '/response.html',
  video_url text default '',
  extra_images jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Worker responses to offer / agreement question
create table if not exists worker_responses (
  user_id text primary key references users(user_id) on delete cascade,
  name text not null,
  choice text not null default 'yes',
  response_text text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Default accounts (same as before)
insert into users (user_id, password, name, role) values
  ('user1', 'pass123', 'Alex Worker', 'worker'),
  ('admin', 'admin123', 'Site Admin', 'admin')
on conflict (user_id) do nothing;

-- Server-only access via SUPABASE_SERVICE_ROLE_KEY (browser never hits Supabase).
-- Keep RLS OFF so seed + API inserts work with service_role (and avoid accidental anon lockouts).
alter table users disable row level security;
alter table templates disable row level security;
alter table form_templates disable row level security;
alter table user_task_settings disable row level security;
alter table daily_work disable row level security;
alter table completions disable row level security;
alter table site_notices disable row level security;
alter table worker_responses disable row level security;
