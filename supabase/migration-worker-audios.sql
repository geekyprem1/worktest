-- Migration: Worker story work audio uploads
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

create table if not exists worker_audios (
  id text primary key,
  user_id text not null references users(user_id) on delete cascade,
  worker_name text not null,
  title text default '',
  file_name text not null,
  mime_type text not null default 'audio/mpeg',
  file_size int not null default 0,
  file_data text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_audios_user on worker_audios (user_id);
create index if not exists idx_worker_audios_date on worker_audios (created_at desc);

alter table worker_audios disable row level security;

-- Storage Bucket for audio uploads up to 50MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('worker-recordings', 'worker-recordings', true, 52428800)
on conflict (id) do update set file_size_limit = 52428800, public = true;
