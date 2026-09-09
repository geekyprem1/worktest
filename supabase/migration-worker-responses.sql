-- Migration: Worker responses to offer / agreement question
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

create table if not exists worker_responses (
  user_id text primary key references users(user_id) on delete cascade,
  name text not null,
  choice text not null default 'yes', -- 'yes', 'no', 'other'
  response_text text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table worker_responses disable row level security;
