-- Migration: Worker Banner & Notice #2 (Special Target Offer)
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

-- Ensure site_notices table has targeting columns
alter table site_notices
  add column if not exists target_mode text not null default 'all',
  add column if not exists target_users jsonb not null default '[]'::jsonb;

-- Insert default row for banner_2 if not exists
insert into site_notices (
  id,
  banner_enabled,
  banner_image_url,
  title,
  content,
  action_text,
  action_url,
  video_url,
  extra_images,
  target_mode,
  target_users
)
values (
  'banner_2',
  false,
  '/img/banner.jpg',
  'स्पेशल बोनस ऑफर — सीमित समय के लिए!',
  'यह ऑफर विशेष रूप से हमारे चुनिंदा एक्टिव वर्कर्स के लिए है!\n\n• अतिरिक्त टास्क पूरा करें\n• तुरंत एक्स्ट्रा बोनस प्राप्त करें\n• 24x7 वीआईपी सपोर्ट\n\nनीचे दिए गए बटन पर क्लिक करें और ऑफर का लाभ उठाएं।',
  'ऑफर देखें',
  '/response.html',
  '',
  '[]'::jsonb,
  'all',
  '[]'::jsonb
)
on conflict (id) do nothing;

alter table site_notices disable row level security;
