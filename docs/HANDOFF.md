- Changed: M0 docs approved; embedding model is now config (`EMBEDDING_MODEL=voyage-3.5-lite`).
- Run: nothing to run yet.
- Next: M1: scaffold Next.js, Supabase auth, tenant onboarding, migrations with RLS, seed data.
- Blocked: `chunks.embedding` dimension unconfirmed; docs.voyageai.com is blocked by the sandbox network (403).
- Manual: allow docs.voyageai.com in environment network settings (or tell me the dimension from Voyage docs); create Supabase + Vercel projects.

## M1: scaffold, auth, onboarding, RLS
- Done: Next.js 16 app, Supabase Auth (mock login in MOCK_MODE, never in prod builds), onboarding creates a pilot tenant, full schema + RLS in `supabase/migrations/0001_init.sql`, seed with 2 tenants.
- Run: `cp .env.example .env.local` (set MOCK_MODE=true, DATABASE_URL, ENCRYPTION_KEY) → `npm run db:reset` → `npm run dev` → /login. Tests: `npm test`.
- Skipped/unchecked: shadcn/ui (plain Tailwind for now), team invites, real Supabase Auth flow (no network), migration never run on a real Supabase project.
- Next: M2 cost ledger + rates + metering helper.
