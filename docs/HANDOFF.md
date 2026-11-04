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

## M4: WhatsApp adapter
- Done: `lib/channels/{types,whatsapp,mock,inbound,outbound}.ts`, webhook `app/api/webhooks/whatsapp` (verify handshake, X-Hub-Signature-256, Zod, dedupe in the same tx as the insert), 24h window, delivery statuses (never downgrade), contact merge, metering per send, agent reply in inbox, Inngest route.
- Run: `npm test` (lib/channels/whatsapp.test.ts); in the app, reply from /inbox (mock send). Real: set WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, MOCK_MODE=false, store the channel token encrypted.
- Skipped/unchecked: webhook rate limiting (M13), media messages stored as "[type message]" only, Graph API version default v23.0 unverified, real Meta send never exercised, template send UI (M8).
- Next: M5 documents + RAG + AI replies + handoff + eval.

## M5: documents, RAG, AI replies, handoff, eval
- Done: /documents upload (PDF/TXT/MD/CSV ≤10 MB) → chunk → embed (`EMBEDDING_MODEL`/`EMBEDDING_DIM`, throws on dim mismatch) → pgvector; pipeline classify (Haiku 5.5) → retrieve → answer only from docs (Opus 5.5, prompt caching, structured output) or hand off (complaint/refund, medical/legal, no docs, low confidence) with summary; metered + audit-logged; Inngest `process-inbound`.
- Run: `npm test` (lib/ai/ai.test.ts); `npm run eval` (MOCK_MODE=true: 18/20, the two misses are the lexical mock; MOCK_MODE=false calls Anthropic + Voyage and costs money).
- Skipped/unchecked: no real Anthropic/Voyage call ever made; retrieval/confidence thresholds (0.35/0.6) untuned; no holding message to the customer on handoff; AI-suggested replies in the inbox; leads saving (M8); scanned PDFs (no OCR); ingestion runs inline in the upload request.
- Next: M6 Slack adapter.

## M6: Slack adapter
- Done: `lib/channels/slack.ts` (v0 signing secret + 5-min replay window, bot/edit/join events ignored, DMs = one conversation per DM, support channel = one conversation per thread, replies in thread), OAuth install (`/api/slack/install` → `/api/slack/oauth`, state cookie, token encrypted, one workspace per tenant), `/api/webhooks/slack`, `/settings/channels` to pick the support channel. Adapter interface unchanged.
- Run: `npm test` (lib/channels/slack.test.ts); app: /settings/channels → Connect Slack (mock install). Real: set SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, APP_URL; Slack app needs scopes chat:write, im:history, channels:history, groups:history and event `message.im`, `message.channels`, `message.groups` → `{APP_URL}/api/webhooks/slack`.
- Skipped/unchecked: Slack user names (contacts show the Slack user id; needs users:read), files/attachments, uninstall event, real Slack never called.
- Next: M7 email adapter.

## M7: email adapter
- Done: `lib/channels/email.ts` (MIME parse via mailparser, thread on References root, quoted-text strip, loop guards for own/auto/list mail, send via Gmail API or SMTP with Re: subject + In-Reply-To/References), Gmail OAuth (`/api/google/install` → `/api/google/oauth`, testing mode), IMAP/SMTP app-password connect with "Test connection", polling (`pollEmail`, Inngest cron every 2 min, "Check email now"), `docs/EMAIL_SETUP.md`. Adapter interface unchanged; fixed outbound recipient to depend on channel.
- Run: `npm test` (lib/channels/email.test.ts); app: /settings/channels → Connect Gmail (mock) → Check email now (reads the in-memory mock mailbox).
- Skipped/unchecked: Gmail Pub/Sub push (polling only), attachments, HTML-only emails rely on mailparser's text conversion, STARTTLS port 587 not auto-detected, real Gmail/IMAP/SMTP never exercised.
- Next: M8 leads, intent tagging, reminders, WhatsApp templates.
