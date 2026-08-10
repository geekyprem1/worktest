-- Run this ONCE in Supabase → SQL Editor if seed fails with:
-- "new row violates row-level security policy for table templates"

alter table users disable row level security;
alter table templates disable row level security;
alter table daily_work disable row level security;
alter table completions disable row level security;
