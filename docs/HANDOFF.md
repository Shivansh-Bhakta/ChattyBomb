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

## M8: leads, intent tagging, reminders, WhatsApp templates
- Done: every inbound message is intent-tagged (M5); booking/sales enquiries save one lead per conversation (`/leads` with status); reminders (callback/appointment/renewal/follow-up) created from a conversation, sent by Inngest cron every 5 min, claimed before sending (never twice), free text in the 24h window else the chosen approved template, failures shown with reason (`/reminders`); approved-template list per WhatsApp channel in /settings/channels; "send template" in the inbox when the window is closed.
- Run: `npm test` (lib/reminders.test.ts); app: Settings → add `appointment_reminder,en,utility` → Inbox → Schedule a reminder.
- Skipped/unchecked: template sync from Meta (list is typed by the owner), template params are only the contact name for reminders, no recurring reminders, at-most-once delivery (a crash mid-send drops that reminder; it shows as sent).
- Next: M9 tenant usage page, plan limits, audit log, tenant data deletion.

## M9: usage, plan limits, audit log, tenant deletion
- Done: `/settings` shows plan, pilot end, conversations used vs limit (by channel) and overage policy; app-wide banner at ≥80% and when over (AI already pauses past the limit under `pause_ai`); owner-only `/settings/audit`; owner deletes the business by typing its exact name (`deleteTenant`: cascades every tenant table, removes stored files and logins, leaves one tenant-less `tenant.delete` audit row).
- Run: `npm test` (lib/tenant-lifecycle.test.ts); app: log in as Anjali (Glow Salon) → Settings.
- Skipped/unchecked: no email notification at 80%/100% (M10/M11 alerts), usage history for deleted tenants is gone (platform revenue reports lose it), Supabase Storage listing handles ≤1000 files per tenant, real Supabase Auth user deletion never exercised.
- Next: M10 platform owner console and alerts. Review docs/REVIEW_FIRST.md first.

## After M9
- Security fix: `supabase/migrations/0004_users_no_owner_insert.sql` (owners could attach any login to their tenant); test added.
- Read `docs/REVIEW_FIRST.md` before M10.

## Review-and-fix session (M1–M9; see docs/REVIEW_FIX_REPORT.md)
- Done: A (asService scoped + guard test), B (`0005` least-privilege grants + cross-tenant trigger, `0007` admin audit + hidden channel credentials), C + fix 6 (startup refuses mock mode in production or off localhost, and missing/malformed production config), fix 1 (unpriced usage flagged + /admin counter), fix 2 + 7 (exactly-once sends: `0006` send state + idempotency keys, only definite rejections retried, unknown outcomes handed to a human), fix 3 (email loop guard), fix 4 (rate limits), fix 5 (answers default to claude-sonnet-5-5).
- Run: `npm test` (86 passing), `npm run typecheck`, `npm run build`, `npm run eval` (18/20 mock, unchanged). Mock mode now needs `APP_URL=http://localhost:<port>` in `.env.local`.
- Skipped/unchecked: no linter configured; nothing tested against real Supabase/PostgREST/Realtime, Meta, Slack, Google, Anthropic or Voyage; the rate limiter is per-instance memory; no reconciliation job for `sending` rows.
- Next: decide the items under "Needs a human decision" in docs/REVIEW_FIX_REPORT.md, merge this branch, then M10.

## M10: platform owner console
- Done: `/admin` (platform_admin only, 404 otherwise): MRR, active tenants, conversations, AI cost, Meta fees, gross margin, 30-day cost and conversation charts, tenants table with negative-margin and ≥80% flags, top 20 costly conversations, unpriced-usage and unknown-send warnings, reconciliation note; tenant page with cost by channel/event, cost per resolved conversation, cache hit rate, controls (suspend, plan, pilot days, overage, per-tenant alert), admin-assisted WhatsApp/IMAP connect; append-only rate editor; CSV export; spend alert emails (Inngest every 15 min, once per day each). Owners can also connect WhatsApp manually in Settings → Channels. Every admin action is audit-logged.
- Run: `npm test` (lib/admin.test.ts); app: log in as Platform Admin.
- Skipped/unchecked: alert email needs `ALERT_SMTP_URL`/`ALERT_FROM` (mock collects them); costs are estimates until reconciled with real bills; no pagination on the tenants table.
- Next: M11 Razorpay subscriptions, GST invoices, pilot flow, overage.

## M11: Razorpay subscriptions, GST invoices, pilot flow, overage
- Done: owner subscribes (Starter/Growth from the rates table) → Razorpay hosted checkout (mock page in MOCK_MODE); signed, deduped webhook `/api/webhooks/razorpay` (activated/charged → active, pending → invoice failed, halted → AI paused, cancelled/completed); monthly invoices (Inngest, 1st 02:00 IST) with plan + overage (only for `bill_overage`) + Meta fees at cost + 18% GST, idempotent per tenant/month, overage+Meta charged as a Razorpay add-on on the next renewal; printable `/invoices/[id]`; billing details (GSTIN validated); pilots expire hourly → suspended; "limit reached" email once a month for `pause_ai`.
- Run: `npm test` (lib/billing/billing.test.ts); app: log in as Anjali → Settings → Growth.
- Skipped/unchecked: Razorpay payload/endpoint shapes not verified against live docs; FOR THE ACCOUNTANT: GST on pass-through Meta fees, IGST vs CGST+SGST, SAC code, FY numbering; Razorpay plans must be created GST-inclusive; overage price is a placeholder (₹2/conversation); no proration on plan changes.
- Next: M12 missed-leads pilot report + landing page signup.
