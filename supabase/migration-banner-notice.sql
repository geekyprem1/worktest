-- Migration: Site notices / Worker promo banner & notice page settings
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

create table if not exists site_notices (
  id text primary key default 'default',
  banner_enabled boolean not null default true,
  banner_image_url text default '/img/banner.jpg',
  title text not null default 'खास आपके लिए रोज कमाए ₹3000 तक',
  content text default 'BS Tech Limited के सभी वर्कर्स के लिए खास मौका!\n\n• घर बैठे काम करें\n• सुरक्षित और भरोसेमंद\n• कोई बड़ी इन्वेस्टमेंट नहीं\n• तुरंत पेमेंट सपोर्ट\n\nनीचे दिए गए लिंक पर क्लिक करके पूरी जानकारी प्राप्त करें और आज ही शुरू करें।',
  action_text text default 'यहां क्लिक करें',
  action_url text default 'https://wa.me/',
  video_url text default '',
  extra_images jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Insert default row if not exists
insert into site_notices (id, banner_enabled, banner_image_url, title, content, action_text, action_url, video_url, extra_images)
values (
  'default',
  true,
  '/img/banner.jpg',
  'खास आपके लिए रोज कमाए ₹3000 तक',
  'BS Tech Limited के सभी वर्कर्स के लिए खास मौका!\n\n• घर बैठे काम करें\n• सुरक्षित और भरोसेमंद\n• कोई बड़ी इन्वेस्टमेंट नहीं\n• तुरंत पेमेंट सपोर्ट\n\nनीचे दिए गए लिंक पर क्लिक करके पूरी जानकारी प्राप्त करें और आज ही शुरू करें।',
  'यहां क्लिक करें',
  'https://wa.me/',
  '',
  '[]'::jsonb
)
on conflict (id) do nothing;

alter table site_notices disable row level security;
