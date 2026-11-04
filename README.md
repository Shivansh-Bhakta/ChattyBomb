# ChattyBomb Omni

One inbox for WhatsApp, Slack and Email, where an AI assistant answers customers from the business's own documents. A platform-owner console tracks revenue, AI cost, Meta fees and margin. Built for Indian local service businesses; prices are in INR, excluding GST.

Docs: `docs/ARCHITECTURE.md` · `docs/DATA_MODEL.md` · `docs/EMAIL_SETUP.md` · `docs/HANDOFF.md` · `docs/REVIEW_FIRST.md` · `docs/REVIEW_FIX_REPORT.md`

## Run locally (mock mode, no keys)
Mock mode replaces WhatsApp, Slack, Email, Razorpay, Anthropic and Voyage with fakes. It only runs on localhost.

1. You need Node 22 and Postgres 16 with pgvector on localhost.
2. Create `.env.local` with:
   ```
   MOCK_MODE=true
   APP_URL=http://localhost:3000
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/chattybomb_dev
   ENCRYPTION_KEY=<output of: openssl rand -base64 32>
   ```
3. Then run:
   ```bash
   npm install
   ```
   ```bash
   npm run db:reset
   ```
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000/login and pick a seeded user. "Platform Admin" opens `/admin`.

Tests: `npm test` (resets the `chattybomb_test` database), `npm run typecheck`, `npm run build`, and `npm run eval` (20 clinic questions).

## Environment variables
`.env.example` lists every name. Real values go only in Vercel (or Supabase) settings, never in the repo. In production the server refuses to start if a required value is missing or malformed (see `lib/startup.ts`).

| Group | Variables |
|---|---|
| Core | `DATABASE_URL`, `ENCRYPTION_KEY` (32 bytes, base64), `APP_URL`, `MOCK_MODE=false` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| AI | `ANTHROPIC_API_KEY`; optional `AI_ANSWER_MODEL` (default `claude-sonnet-5-5`) and `AI_CLASSIFY_MODEL` (default `claude-haiku-5-5`); `VOYAGE_API_KEY`, `EMBEDDING_MODEL=voyage-3.5-lite`, `EMBEDDING_DIM=1024` |
| Jobs | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` |
| WhatsApp | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`; optional `WHATSAPP_GRAPH_VERSION` |
| Slack | `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Google (Gmail) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH` |
| Invoices | `SUPPLIER_NAME`, `SUPPLIER_GSTIN`, `SUPPLIER_ADDRESS`, `SUPPLIER_STATE` |
| Email out | `ALERT_SMTP_URL` (e.g. `smtps://user:pass@smtp.host:465`), `ALERT_FROM` |
| Monitoring | `ERROR_WEBHOOK_URL` (optional; e.g. a Slack incoming webhook) |

## Setting up each service

### Supabase
1. Create a project in the India region (Mumbai), if it is offered.
2. Apply `supabase/migrations/*` in order: `supabase db push`, or paste each file into the SQL editor. **Never run `supabase/local-shim.sql` on Supabase.**
3. Storage: create a **private** bucket named `documents`.
4. Auth: enable email+password. Set the Site URL to `APP_URL`.
5. Make yourself platform admin. Sign up once, then in SQL run:
   ```sql
   update users set role = 'platform_admin', tenant_id = null where email = '<you>';
   ```
   If your account already owns a test business, delete that business first.
6. Turn on Point-in-time recovery (backups) on a paid plan.

### Inngest (jobs: AI replies, email polling, reminders, alerts, invoices, pilot expiry)
1. Install the Inngest integration on the Vercel project. It sets `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`.
2. The app serves its jobs at `/api/inngest`.

### WhatsApp (Meta)
1. In Meta Business Suite, create a Business portfolio and complete **business verification**.
2. In developers.facebook.com, create an app of type Business and add the **WhatsApp** product.
3. Set the webhook:
   - Callback URL: `{APP_URL}/api/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
4. Set `WHATSAPP_APP_SECRET` to the App secret (Settings → Basic). Every webhook is checked against it.
5. **Manual setup (first pilots):** create a System User with a permanent token (`whatsapp_business_messaging` permission). The owner enters the Phone number ID and token in Settings → Channels → WhatsApp, or you enter them from `/admin` during a call.
6. **Embedded Signup (later, self-serve):** register as a Tech Provider and add Meta's Embedded Signup flow. It is not built yet.
7. Templates: create and get approval in WhatsApp Manager. Then list each one in Settings → Channels as `name,language,category`.
8. Meta's per-template prices go in `/admin` → Rates (`meta:<category>:IN`).

### Slack
1. At api.slack.com, create an app.
2. Bot scopes: `chat:write`, `im:history`, `channels:history`, `groups:history`.
3. Redirect URL: `{APP_URL}/api/slack/oauth`.
4. Event Subscriptions: request URL `{APP_URL}/api/webhooks/slack`. Bot events: `message.im`, `message.channels`, `message.groups`.
5. Set `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`. Owners click **Connect Slack**.

### Google Cloud (Gmail)
See `docs/EMAIL_SETUP.md`. Use OAuth in Testing mode for pilots; production needs Google verification and a CASA assessment. IMAP/SMTP with an app password is the fallback.

### Razorpay
1. Complete KYC and enable Subscriptions.
2. Create two **Plans**: Starter and Growth, monthly. **Enter the amounts GST-inclusive**: ₹999 → ₹1,178.82 and ₹2,999 → ₹3,538.82. Set `RAZORPAY_PLAN_STARTER` and `RAZORPAY_PLAN_GROWTH` to their ids.
3. Webhook: `{APP_URL}/api/webhooks/razorpay`, with secret `RAZORPAY_WEBHOOK_SECRET`. Events:
   - `subscription.authenticated`, `activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, `resumed`
4. API keys go in `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
5. The plan prices the app shows come from `/admin` → Rates (`plan:starter:monthly`, `plan:growth:monthly`). The overage price is `plan:overage:per_conversation`.
6. The request and webhook shapes were written without live access to Razorpay's docs. Test on Razorpay **test mode** first.

### Landing page
Point the "Start free pilot" button on chattybong.vercel.app at `{APP_URL}/signup?ref=landing`.

### Monitoring
- Uptime: point an uptime checker at `{APP_URL}/api/health` (200 = ok, 503 = database down).
- Errors: every unhandled server error is logged as one JSON line with `"level":"error"`, secrets redacted. If `ERROR_WEBHOOK_URL` is set, it is also posted there. Add a Vercel log drain or alert on that line.

## Deployment checklist
- [ ] All environment variables set in Vercel; `MOCK_MODE=false`. The app refuses to start otherwise.
- [ ] Migrations applied, `documents` bucket created, platform admin set.
- [ ] Inngest connected; jobs visible in the Inngest dashboard.
- [ ] Real prices entered in `/admin` → Rates: Anthropic, Voyage, Meta per category, `fx:USD_INR`, plan and overage prices. The seed values are placeholders.
- [ ] Spend alert email and thresholds set in `/admin`.
- [ ] Webhooks registered (Meta, Slack, Razorpay) and a test message received on each channel.
- [ ] Each channel shows **connected** after "Test connection".
- [ ] `npm run eval` run with `MOCK_MODE=false` on a real clinic FAQ. This costs money, so tune `AI_MIN_RETRIEVAL_SCORE` and `AI_MIN_CONFIDENCE` with it.
- [ ] Uptime check on `/api/health`, and an error alert on the log drain.
- [ ] Supabase backups (PITR) on.

## Before real customers
- [ ] Security review of auth, RLS policies (`0005`, `0007`), token encryption and the admin console.
- [ ] Privacy policy, terms of service and a data processing agreement, reviewed by a lawyer.
- [ ] Meta business verification and WhatsApp template approvals.
- [ ] Google verification for production Gmail access.
- [ ] GST and invoice format reviewed by an accountant: GST on passed-through Meta fees, IGST vs CGST+SGST, SAC code, and invoice numbering per financial year.
- [ ] Error monitoring, backups and uptime alerts live.
- [ ] Start with one supervised pilot business before a wider launch.
