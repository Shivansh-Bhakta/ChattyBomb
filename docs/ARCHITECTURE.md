# Architecture (one page)

## Components
```
 WhatsApp Cloud API ─┐                         ┌─ Anthropic (classify: small model, answer: large model)
 Slack Events API ───┤  Next.js on Vercel      ├─ Voyage (embeddings)
 Gmail Pub/Sub/IMAP ─┼─▶ app/api/webhooks/* ──▶│  Inngest (jobs, schedules, retries)
 Razorpay ───────────┘   app/(app)/*  inbox    ├─ Supabase: Postgres+RLS, Auth, Realtime,
                         app/admin/*  console  │           Storage, pgvector
                         lib/channels/*        └─ Email alerts (Resend or SMTP, decided in M10)
```
One Next.js app. Supabase is the only database. Inngest owns all background work.

## Folder layout
```
app/(marketing)/          signup/login (target of landing page "Start free pilot")
app/(app)/inbox|leads|reminders|documents|settings/
app/admin/                platform_admin only
app/api/webhooks/{whatsapp,slack,email,razorpay}/route.ts
app/api/inngest/route.ts
lib/channels/{types,whatsapp,slack,email,mock}.ts
lib/ai/{classify,retrieve,answer}.ts
lib/metering.ts           only path that writes usage_events
lib/crypto.ts             AES-256-GCM for channel credentials
lib/supabase/{browser,server,service}.ts
inngest/                  functions: process-inbound, send-reply, ingest-document, reminders, alerts, billing
supabase/migrations/      SQL + RLS policies; supabase/seed.sql
```

## Channel adapter interface (`lib/channels/types.ts`)
`verify(req) → bool` · `parse(req) → InboundMessage[] | StatusUpdate[]` ·
`send(channel, conversation, OutboundMessage) → { providerMessageId }` ·
`canSendFreeform(conversation) → bool` (WhatsApp: 24h window; others: true).
`MOCK_MODE=true` returns the mock adapter for every channel.

## Flow: inbound message
1. Webhook route verifies the signature (WA `X-Hub-Signature-256`, Slack signing
   secret, Gmail Pub/Sub token, Razorpay signature) and validates the body with Zod.
2. Insert into `webhook_events`; on conflict, return 200 and stop (idempotent).
3. Resolve tenant via `channels (type, external_id)`, upsert contact (merge on
   phone/email), upsert conversation, insert message, write `conversation_billed`
   if it's the first inbound this month. Return 200.
4. Send Inngest event `message.received`. Supabase Realtime pushes the row to the inbox.

## Flow: AI reply (Inngest `process-inbound`)
1. Skip if `ai_paused`, tenant suspended, or over limit with `overage_policy = pause_ai`.
2. Classify intent (small model). Save lead if `sales_lead`/`booking`.
3. Retrieve top-k chunks for the tenant (pgvector cosine).
4. Handoff if low confidence, no relevant chunks, or intent is refund/complaint,
   or the topic needs medical/legal judgment: set `needs_human`, write summary, notify.
5. Otherwise answer only from the retrieved context in the customer's language
   (English/Hindi/Hinglish). Prompt caching on system prompt + context.
6. Send via adapter (template if outside the WA 24h window), write `audit_log`.
7. Every model/embedding/WA call goes through `metering.record(...)`.

## Metering and cost
`metering.record({tenantId, conversationId, eventType, quantity, rateKey})` looks up
the current rate in `rates` (USD converted with `fx:USD_INR`) and inserts
`usage_events`. Costs are estimates; the admin console shows a reconciliation note
against the real Anthropic and Meta bills.

## Billing
Razorpay Subscriptions (UPI autopay, cards). Webhooks are idempotent via
`webhook_events`. A monthly Inngest job builds the invoice: plan + overage + Meta
template fees at cost + 18% GST. 80% usage warning; overage per tenant setting.
14-day pilot, no card; at the end a job builds the "missed leads" report.

## Security
- RLS on every tenant table; service role only in webhooks/jobs with explicit `tenant_id`.
- Channel credentials encrypted at rest; never customer passwords.
- `/admin` checks `platform_admin` server-side; every action goes to `audit_log`,
  including admin-assisted channel setup.
- Per-tenant deletion endpoint (cascade + Storage cleanup). No training on customer data.

## Environments
- Cloud sandbox: `MOCK_MODE=true` + local Supabase (`supabase start`). No external APIs.
- Vercel preview: real services, one at a time, with keys set in Vercel/Supabase.
- Gmail: OAuth testing mode first; Google verification needed for production.
- WhatsApp: manual setup for the first pilot, Embedded Signup later.
