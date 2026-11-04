# ChattyBomb Omni: Master Build Spec (for Claude Code)

You are the lead engineer building **ChattyBomb Omni**: a multi-tenant SaaS where a business connects WhatsApp, Slack and Email, sees every conversation in one inbox, and has an AI assistant answer from the business's own documents. The platform owner (me) has a separate console showing revenue, API costs, Meta fees and margin per customer.

## 0. Product context
- Landing page already exists: chattybong.vercel.app (brand: ChattyBomb).
- Core promise: answers customers from the business's own PDFs/FAQs/price lists, saves leads, tracks bookings/callbacks/renewals, and hands off to a human when judgment is needed.
- Target: Indian local service businesses (clinics, salons, coaching centers). Prices in INR, exclusive of GST.
- Plans: Starter Rs 999/mo (500 conversations), Growth Rs 2,999/mo (2,000 conversations, follow-up automation, callback/renewal reminders), Scale custom (multi-branch). Optional one-time onboarding Rs 2,000-5,000. Replies inside WhatsApp's 24-hour window are free; template follow-ups are passed through at Meta's cost. 14-day free pilot ending with a "missed leads" report.
- Do not train on customer data. No SOC 2 claims.

## 1. Token-efficiency rules (follow strictly)
1. Keep `CLAUDE.md` under 150 lines: these rules, architecture summary, conventions. Read this spec only by section, never whole, once M0 is done.
2. **Smallest complete change (ponytail principle):** make the smallest change that fully works. No speculative abstractions, unused config, or "future-proof" layers. Patch with targeted diffs; never re-output whole files you only need to edit.
3. **Use the code graph before reading files.** After every milestone run `/graphify .`. Query the graph (what calls this, what breaks if it changes) and open only the files it points to. No broad greps, no catting large files.
4. Work milestone by milestone. After each: run tests, commit, print a 5-line summary, then STOP and wait for me to say "next".
5. Terse replies. Do not restate my request or re-print code you wrote. Report only: what changed, how to run it, what's next.
6. Never paste secrets, long logs or whole files into chat. Show only the failing lines.
7. Use cheaper models for routine work; ask me before switching to the most expensive one.
8. If context is getting heavy, save state to `docs/HANDOFF.md` and tell me to `/clear` or `/compact`.
9. Prefer managed services and libraries over hand-written infra.

## 2. Suggested stack (change only with a stated reason)
Next.js App Router + TypeScript + Tailwind + shadcn/ui; Supabase (Postgres, Auth, Realtime, Storage, pgvector); Inngest or Trigger.dev for queues, schedules, reminders; Zod; Vitest; Razorpay Subscriptions; Anthropic API; Vercel deploy. One Next.js app, with `/lib/channels/{whatsapp,slack,email,types}.ts`.

## 3. Channels (one common adapter interface; new channel = one adapter)
- **WhatsApp Cloud API:** webhook verify + receive + send, delivery statuses. Track the 24-hour window per conversation; outside it, only approved template messages.
- **Slack:** OAuth install per workspace, Events API, handle DMs and a chosen channel, reply in thread, verify signing secret.
- **Email:** Gmail API via Google OAuth (Pub/Sub push or polling), IMAP/SMTP fallback adapter. Thread by Message-ID / In-Reply-To. Gmail read scopes are restricted and need Google verification for production: build in OAuth testing mode and document the verification steps.
- All webhooks: verify signatures (WhatsApp `X-Hub-Signature-256`, Slack signing secret), idempotent (dedupe by provider message id), retries with backoff, rate limiting.

## 4. Business dashboard (unified inbox)
- Conversation list across channels: channel badge, customer, last message, status (open / waiting on customer / needs human / resolved), assignee, unread count, search, filters.
- Conversation view: full thread, AI-suggested reply (accept/edit/send), internal notes, assign/transfer, resolve, "take over from AI" toggle that pauses the bot.
- Realtime updates. Contacts merged across channels by phone/email.
- Leads view, reminders/follow-ups view, documents (knowledge base) manager.
- Settings: channels, team and roles (owner, agent), plan, usage (conversations used vs limit), invoices.

## 5. AI assistant (RAG)
- Upload PDFs/FAQs/price lists; chunk, embed, store in pgvector per tenant.
- Retrieve top-k and answer ONLY from retrieved material, in the customer's language (English/Hindi/Hinglish), friendly tone.
- Low confidence, or topics like complaints, refunds, medical/legal judgment: do not answer; hand off to a human with a conversation summary and mark "needs human".
- Intent classification per message: booking, refund/complaint, price query, sales lead, other. Save leads (name, contact, intent, source channel).
- Follow-ups via scheduled jobs: callbacks, appointment reminders, renewal nudges; WhatsApp templates when outside the 24h window.
- Anthropic usage: prompt caching on system prompt and retrieved context; small model for classification, larger model only for final answers.
- Eval script of 20 sample Q&As for a clinic.

## 6. Multi-tenancy, security, compliance
- Every table has `tenant_id` with Postgres Row Level Security. Roles: `platform_admin`, `owner`, `agent`.
- Encrypt channel tokens at rest. Audit log of every AI reply and every human override.
- Per-tenant data-deletion endpoint. No training on customer data.

## 7. Cost ledger and metering (build early, before AI/WhatsApp go live)
- Table `usage_events`: tenant_id, conversation_id, channel, event_type (`ai_input_tokens`, `ai_output_tokens`, `ai_cached_tokens`, `embedding_tokens`, `wa_template_message`, `wa_service_message`, `storage_mb`), quantity, unit_cost_inr, total_cost_inr, created_at.
- One row for every Anthropic call (from the response `usage` field), embedding call and WhatsApp message sent.
- Table `rates`: model prices, Meta per-template rates by category and country, USD/INR rate, each with `effective_from`. Editable by me. Never hardcode prices.
- Monthly conversation counting per tenant against plan limits.

## 8. Platform owner console (`/admin`, role `platform_admin` only, audit-logged)
- Overview: MRR, active tenants, conversations this month, total AI cost, total Meta fees, gross margin %, daily trend chart.
- Tenants table: plan, conversations vs limit, AI cost, Meta fees, revenue, margin per tenant; flag negative-margin tenants and any over 80% of limit. Click-through cost breakdown by channel and event.
- Drill-down: top 20 most expensive conversations, cost per resolved conversation, cache hit rate.
- Controls: suspend/unsuspend, change plan, grant pilot days, edit rates, export CSV.
- Alerts by email when daily AI spend or a single tenant's spend crosses thresholds I set.
- Note: costs are estimates (tokens x my rates); include a reconciliation note against actual Anthropic and Meta bills.

## 9. Billing (tenant-facing)
- Razorpay Subscriptions (UPI autopay and cards); webhooks for success/failure/cancel, idempotent.
- Monthly invoice with 18% GST line, plus a separate line for Meta template fees passed through at cost from `usage_events`. Flag GST/invoice format for review by my accountant.
- Soft warning at 80% of conversations; overage policy is a per-tenant setting (pause AI and notify, or bill overage).
- Free pilot: 14 days, no card; on pilot end, auto-generate the "missed leads" report (leads captured, bookings handled, after-hours messages answered).
- Signup/login wired from the landing page's "Start free pilot".

## 10. Milestones (stop after each)
- **M0** Plan only: write `CLAUDE.md`, data model (tenants, users, channels, contacts, conversations, messages, documents, chunks, leads, reminders, usage_events, rates, subscriptions, invoices, audit_log), one-page architecture doc. No code. Wait for approval.
- **M1** Scaffold app, auth, tenant onboarding, migrations with RLS, seed data.
- **M2** Cost ledger + rates table + metering helper used by every billable call.
- **M3** Unified inbox UI on seeded data (list, thread, status, assign, notes).
- **M4** WhatsApp adapter (Meta test number), 24h window, delivery statuses, instrumented for cost.
- **M5** Document upload + RAG + AI replies + handoff rules + eval script, instrumented for cost.
- **M6** Slack adapter.
- **M7** Email adapter (Gmail OAuth + IMAP fallback).
- **M8** Leads, intent tagging, reminders/follow-up queue, WhatsApp templates.
- **M9** Tenant usage page, plan limits, audit log, tenant data deletion.
- **M10** Platform owner console and alerts.
- **M11** Razorpay subscriptions, GST invoices, pilot flow, overage policy.
- **M12** Missed-leads pilot report + landing page signup integration.
- **M13** Hardening: signature checks, rate limits, idempotency tests, error monitoring, README with setup for Meta app, Slack app, Google Cloud, Razorpay, and a deployment checklist.

## 11. Working agreement
Begin with M0 only. Ask at most 5 clarifying questions in one message if truly blocking; otherwise state assumptions in one line each and proceed. At each milestone, list what I must do manually (API keys, Meta/Google/Slack app setup, approvals).

## 12. Extra rules

### Secrets and mock mode
- Use environment variables for every secret. Create .env.example with variable
  names only (no values), and make sure all .env* files are gitignored.
- Never ask me to paste a secret into chat. Refer to secrets by name only,
  for example ANTHROPIC_API_KEY.
- Build mock/fake adapters for WhatsApp, Slack, Email, Razorpay, and the
  Anthropic call. Switch with MOCK_MODE=true so everything runs end to end
  without real keys. When MOCK_MODE=false, use the real services. I will add
  real keys later, one service at a time.
- Production secrets live in Vercel/Supabase settings, never in the repo or
  in the cloud session environment.

### Connect channels onboarding
- Build a "Connect channels" wizard per channel (WhatsApp, Slack, Email) showing
  status: not connected / pending / connected / error.
- Each step has a "Test connection" button and plain instructions for what the
  business must do on Meta, Google and Slack.
- Never ask the business for passwords. Store only OAuth or API tokens,
  encrypted at rest.
- Add an admin-assisted mode: from /admin I can enter or connect a customer's
  channel credentials for them during a setup call, with every action
  audit-logged.
- For Email, support Gmail OAuth (testing mode first) and IMAP/SMTP with an app
  password as a fallback. For WhatsApp, document both manual setup (for the
  first pilot) and Embedded Signup (for later self-serve).

### Cloud session constraints
- Assume the sandbox cannot reach Meta, Slack, Google, Razorpay or the
  Anthropic API. Develop and test against mocks and a local test database.
- Real integration testing happens on a Vercel preview deployment, and I will
  paste back any error lines.
- Keep every session to one milestone. At the end update docs/HANDOFF.md with
  at most 5 lines: what changed, how to run, what is next, and what I must do
  manually.

### Before real customers (add to the M13 checklist)
- Security review of auth, RLS policies, token encryption and the admin console.
- Privacy policy, terms of service and a data processing agreement for review
  by a lawyer.
- Meta business verification and WhatsApp template approvals.
- Google verification for production Gmail access.
- Error monitoring, backups and uptime alerts.
- Start with one supervised pilot business before wider launch.
