# BS Tech Limited — Survey Work

Survey work app for **BS Tech Limited** (worker + admin).  
Built for **free Vercel + free Supabase**.

## Deploy (free)

Full steps: **[SETUP-VERCEL.md](./SETUP-VERCEL.md)**

1. Create Supabase project → run `supabase/schema.sql`
2. Set `.env.local` from `.env.example`
3. `npm install` → `npm run seed:supabase`
4. Push to GitHub → import on Vercel → add same env vars → Deploy

## Local run (with Supabase)

```bash
npm install
# fill .env.local first
npm run seed:supabase
npm start
```

Open **http://localhost:3000**

## Accounts

| Role   | User ID | Password  |
|--------|---------|-----------|
| Worker | `user1` | `pass123` |
| Admin  | `admin` | `admin123`|

## How it works

1. **Admin** → add workers → **Generate / Update Today**
2. Daily batch for every worker
3. **Worker** → Start Work → one-by-one surveys + 1 min cooldown
4. Dashboard shows completed dates

## Project layout

- `server.js` / `api/index.js` — Express API (Vercel serverless)
- `lib/` — Supabase DB + JWT auth
- `supabase/schema.sql` — database tables
- `public/` — login, worker, admin UI
