# Data model

Postgres on Supabase. All ids `uuid default gen_random_uuid()`, all times `timestamptz`
(UTC), every table has `created_at default now()`. Enums are Postgres enums.

## Tenancy and RLS
- Every table except `rates` and `webhook_events` has `tenant_id uuid not null
  references tenants on delete cascade` (`audit_log.tenant_id` is nullable).
- Helpers (SQL, `security definer`, `stable`):
  - `current_tenant_id()`: `select tenant_id from users where id = auth.uid()`
  - `is_platform_admin()`: `select role = 'platform_admin' from users where id = auth.uid()`
- Default policy on tenant tables: `using (tenant_id = current_tenant_id() or is_platform_admin())`,
  same `with check`. Agent vs owner limits are enforced by extra policies on
  `users`, `channels`, `subscriptions` and `invoices` (owner only).
- `audit_log`: insert + select only; no update/delete policy (append-only).
- `rates`: select for everyone signed in, write for `platform_admin` only.
- `webhook_events`: no policies, so only the service role can use it.
- Webhooks and Inngest jobs use the service role (bypasses RLS) and must filter
  by `tenant_id` explicitly. Tenant isolation gets a test in M1.
- Tenant deletion = `delete from tenants` (cascade) + an Inngest job that removes the
  tenant's Storage folder `tenants/{tenant_id}/`.

## Money
- Invoice and subscription amounts: `bigint` paise (`*_paise`).
- Usage costs: `numeric(14,6)` INR (sub-paise per-token costs).
- All prices exclusive of GST.

## Tables

### tenants
`id, name, slug unique, plan (starter|growth|scale), status (pilot|active|suspended|cancelled),
conversation_limit int, overage_policy (pause_ai|bill_overage) default pause_ai,
pilot_ends_at, timezone default 'Asia/Kolkata', gstin null, billing_name, billing_address,
alert_daily_spend_inr numeric null`

### users
`id (= auth.users.id), tenant_id null (null only for platform_admin), role (platform_admin|owner|agent),
name, email, created_at`. One user belongs to one tenant.

### channels
`id, tenant_id, type (whatsapp|slack|email), provider (meta|slack|gmail|imap),
status (not_connected|pending|connected|error), external_id (WA phone_number_id |
Slack team_id | email address), config jsonb (non-secret: WABA id, Slack channel id,
IMAP host...), credentials_encrypted bytea, last_error text, connected_by uuid null
references users, connected_at`
- `unique (type, external_id)`: routes an inbound webhook to exactly one tenant.

### contacts
`id, tenant_id, name, phone (E.164) null, email (lowercased) null, slack_user_id null, notes`
- `unique (tenant_id, phone)`, `unique (tenant_id, email)`, `unique (tenant_id, slack_user_id)`.
- Merging across channels = match on phone or email at insert time.

### conversations
`id, tenant_id, channel_id, contact_id, external_thread_id (WA: contact phone;
Slack: channel+thread_ts; Email: root Message-ID), status (open|waiting_on_customer|needs_human|resolved),
assignee_id null references users, ai_paused bool default false, last_message_at,
last_inbound_at (WhatsApp 24h window = now() - last_inbound_at < 24h), unread_count int,
summary text null (handoff summary), resolved_at`
- `unique (channel_id, external_thread_id)`; index `(tenant_id, status, last_message_at desc)`.

### messages
`id, tenant_id, conversation_id, direction (inbound|outbound|note),
sender_type (contact|agent|ai|system), sender_user_id null, body text,
attachments jsonb default '[]', provider_message_id null, email_message_id null,
in_reply_to null, status (received|queued|sent|delivered|read|failed),
error text null, is_template bool, template_name null, intent null
(booking|refund_complaint|price_query|sales_lead|other), ai_confidence numeric null`
- `unique (conversation_id, provider_message_id)` (idempotency, nulls allowed for notes).
- Internal notes are `direction = 'note'` and are never sent.
- Full-text search: generated `tsvector` column on `body` + GIN index.

### documents
`id, tenant_id, title, storage_path, mime_type, size_bytes, status (uploaded|processing|ready|failed),
error null, uploaded_by references users`

### chunks
`id, tenant_id, document_id references documents on delete cascade, idx int, content text,
token_count int, embedding vector(1024)`
- HNSW index on `embedding vector_cosine_ops` (needs pgvector >= 0.5; verified locally on 0.6.0).
  Retrieval always filters `tenant_id`.
- Model and size are config: `EMBEDDING_MODEL=voyage-3.5-lite`, `EMBEDDING_DIM=1024`
  (voyage-3.5-lite default per Voyage's API reference; it also supports 256/512/2048).
  Code requests `output_dimension = EMBEDDING_DIM` and throws if a returned vector differs.
  Changing either later means a new migration and re-embedding every chunk.

### leads
`id, tenant_id, contact_id, conversation_id null, name, phone, email, intent,
source_channel (whatsapp|slack|email), status (new|contacted|won|lost), notes`

### reminders
`id, tenant_id, contact_id, conversation_id null, type (callback|appointment|renewal|follow_up),
due_at, status (scheduled|sent|cancelled|failed), message text, template_name null,
created_by null references users, sent_at null`
- Inngest job scheduled at `due_at`; uses a WhatsApp template if outside the 24h window.

### usage_events
`id, tenant_id, conversation_id null, channel null, event_type
(ai_input_tokens|ai_output_tokens|ai_cached_tokens|embedding_tokens|wa_template_message|
wa_service_message|storage_mb|conversation_billed), quantity numeric, rate_id references rates,
unit_cost_inr numeric(14,6), total_cost_inr numeric(14,6), model null, meta jsonb`
- One row per Anthropic call component (from response `usage`), embedding call and WA send.
- `conversation_billed` (cost 0) is written once per conversation per calendar month on
  its first inbound message; the plan-limit count is a `count(*)` over it.
- Index `(tenant_id, created_at)`, `(conversation_id)`.

### rates
`id, key text (e.g. 'anthropic:<model>:input_per_mtok', 'anthropic:<model>:cached_per_mtok',
'voyage:voyage-3:per_mtok', 'meta:marketing:IN', 'meta:utility:IN', 'fx:USD_INR'),
value numeric(14,6), currency (USD|INR), unit text, effective_from timestamptz, note`
- `unique (key, effective_from)`. Current rate = latest `effective_from <= now()`.
- Edited by the platform owner in `/admin`; never hardcoded.

### subscriptions
`id, tenant_id, plan, razorpay_subscription_id unique null, razorpay_customer_id null,
status (created|active|halted|cancelled|completed), amount_paise, current_period_start,
current_period_end, cancelled_at`

### invoices
`id, tenant_id, subscription_id null, number unique, period_start, period_end,
subtotal_paise, meta_fees_paise (pass-through from usage_events), overage_paise,
gst_paise (18%), total_paise, status (draft|issued|paid|failed|void),
razorpay_payment_id null, lines jsonb, pdf_path null`
- GST/invoice format flagged for accountant review (M11).

### audit_log
`id, tenant_id null, actor_type (user|ai|system|platform_admin), actor_user_id null,
action text (e.g. 'ai.reply', 'human.override', 'admin.suspend', 'channel.connect'),
target_type, target_id, metadata jsonb`
- Written for every AI reply, human override and every `/admin` action.

### webhook_events (added for idempotency)
`provider (whatsapp|slack|gmail|razorpay), event_id, received_at`, primary key
`(provider, event_id)`. Insert-or-skip before processing any webhook.

## Not modelled yet (skipped on purpose)
Multi-branch (Scale plan), per-agent working hours, message attachments in Storage
beyond a jsonb list, a separate plans table (limits live on `tenants`).
