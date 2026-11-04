## M0: plan (approved)
- Done: CLAUDE.md, docs/DATA_MODEL.md, docs/ARCHITECTURE.md. Embeddings: voyage-3.5-lite, 1024 dims (config: EMBEDDING_MODEL, EMBEDDING_DIM).
- Manual: create Supabase + Vercel projects before real-service testing.

## M1: scaffold, auth, onboarding, RLS
- Done: Next.js 16 app, Supabase Auth (mock login in MOCK_MODE, never in prod builds), onboarding creates a pilot tenant, full schema + RLS in `supabase/migrations/0001_init.sql`, seed with 2 tenants.
- Run: `cp .env.example .env.local` (set MOCK_MODE=true, DATABASE_URL, ENCRYPTION_KEY) → `npm run db:reset` → `npm run dev` → /login. Tests: `npm test`.
- Skipped/unchecked: shadcn/ui (plain Tailwind for now), team invites, real Supabase Auth flow (no network), migration never run on a real Supabase project.
- Next: M2 cost ledger + rates + metering helper.

## M2: cost ledger
- Done: `lib/metering.ts` (`record`, `recordAnthropicUsage`, `markConversationBilled`, `conversationsThisMonth`); prices only from `rates` (latest `effective_from`, USD→INR via `fx:USD_INR`).
- Run: `npm test` (lib/metering.test.ts). Placeholder rates are in `supabase/seed.sql`.
- Skipped/unchecked: all seeded prices are PLACEHOLDERS (no network to check Anthropic/Meta/Voyage pricing); storage_mb metering; rate editing UI (M10).
- Missing rate → row kept at cost 0 with `meta.missing_rate` (never blocks a send). Next: M3 inbox UI.

## M3: unified inbox
- Done: `/inbox` list (channel badge, contact, last message, status, assignee, unread, search, status/channel filters) + thread (notes, status, assign, take-over toggle), all via RLS + audit log; Supabase Realtime refresh.
- Run: `npm run db:reset && npm run dev` → /login → Dr. Mehta → Inbox. Tests: `npm test` (lib/inbox.test.ts).
- Skipped/unchecked: Realtime untested (no Supabase here); server actions only covered by a manual Playwright smoke run, no unit tests; no pagination past 100.
- Next: M4 WhatsApp adapter (mock), 24h window, delivery statuses, metering.
