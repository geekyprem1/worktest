# BS Tech Limited — Free deploy (Vercel + Supabase)

## Tumhe kya banana / dena hai

Mujhe chat me **keys mat bhejna** (security). Khud dashboard me daal dena.

### 1) Supabase (free)

1. https://supabase.com → Sign up → **New project**
2. Project name kuch bhi (e.g. `bs-tech-survey`)
3. Database password save rakhna
4. Project ready hone ke baad:

**A. SQL chalao**

- Left menu → **SQL Editor** → New query  
- File kholo: `supabase/schema.sql`  
- Poora paste → **Run**

**B. Keys copy karo**

- **Project Settings** → **API**
- `Project URL` → yeh `SUPABASE_URL`
- `service_role` key (secret) → yeh `SUPABASE_SERVICE_ROLE_KEY`  
  ⚠️ **`anon` / `public` key mat use karna** — seed fail hoga (RLS error)  
  ⚠️ `service_role` kabhi frontend / public me mat daalna

**Agar seed pe RLS error aaye**

SQL Editor me `supabase/fix-rls.sql` chalao, phir seed dubara.

### 2) Local seed (templates DB me)

PC pe project folder me:

```bash
copy .env.example .env.local
```

`.env.local` me bharo:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=koi-lamba-random-secret-likho
```

Phir:

```bash
npm install
npm run seed:supabase
```

Success: `500 templates + default users`

### 3) Vercel (free)

1. Code GitHub pe push karo (`.env.local` mat push karna — `.gitignore` me hai)
2. https://vercel.com → **Add New Project** → GitHub repo import
3. **Environment Variables** me same 3 values:

| Name | Value |
|------|--------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `JWT_SECRET` | lamba random string |

4. Deploy → URL milega: `https://something.vercel.app`

### 4) Test

- Open site → login `admin` / `admin123`
- Generate today 50
- Logout → `user1` / `pass123` → Start Work

---

## Checklist (tum kya complete karoge)

- [ ] Supabase project banaya
- [ ] `schema.sql` run kiya
- [ ] `.env.local` bhar diya (local)
- [ ] `npm run seed:supabase` success
- [ ] GitHub pe push
- [ ] Vercel pe 3 env vars set
- [ ] Deploy live test

## Agar atak jao

- `/api/health` kholo → `"supabase": true` hona chahiye  
- Templates 0 dikhen → seed dubara chalao  
- Login fail → schema + seed users check karo  

## Default logins

| Role | User ID | Password |
|------|---------|----------|
| Worker | user1 | pass123 |
| Admin | admin | admin123 |
