-- Migration: Targeted worker banner & notice page settings
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

alter table site_notices
  add column if not exists target_mode text not null default 'all',
  add column if not exists target_users jsonb not null default '[]'::jsonb;
