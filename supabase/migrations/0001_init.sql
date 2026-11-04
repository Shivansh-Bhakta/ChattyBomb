-- ChattyBomb Omni schema. See docs/DATA_MODEL.md.
-- Assumes Supabase: auth schema, auth.uid(), roles anon/authenticated/service_role.
create extension if not exists vector;

create type plan as enum ('starter', 'growth', 'scale');
create type tenant_status as enum ('pilot', 'active', 'suspended', 'cancelled');
create type overage_policy as enum ('pause_ai', 'bill_overage');
create type user_role as enum ('platform_admin', 'owner', 'agent');
create type channel_type as enum ('whatsapp', 'slack', 'email');
create type channel_provider as enum ('meta', 'slack', 'gmail', 'imap');
create type channel_status as enum ('not_connected', 'pending', 'connected', 'error');
create type conversation_status as enum ('open', 'waiting_on_customer', 'needs_human', 'resolved');
create type message_direction as enum ('inbound', 'outbound', 'note');
create type sender_type as enum ('contact', 'agent', 'ai', 'system');
create type message_status as enum ('received', 'queued', 'sent', 'delivered', 'read', 'failed');
create type intent as enum ('booking', 'refund_complaint', 'price_query', 'sales_lead', 'other');
create type document_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type lead_status as enum ('new', 'contacted', 'won', 'lost');
create type reminder_type as enum ('callback', 'appointment', 'renewal', 'follow_up');
create type reminder_status as enum ('scheduled', 'sent', 'cancelled', 'failed');
create type usage_event_type as enum ('ai_input_tokens', 'ai_output_tokens', 'ai_cached_tokens',
  'embedding_tokens', 'wa_template_message', 'wa_service_message', 'storage_mb', 'conversation_billed');
create type currency as enum ('USD', 'INR');
create type subscription_status as enum ('created', 'active', 'halted', 'cancelled', 'completed');
create type invoice_status as enum ('draft', 'issued', 'paid', 'failed', 'void');
create type actor_type as enum ('user', 'ai', 'system', 'platform_admin');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  slug text not null unique,
  plan plan not null default 'starter',
  status tenant_status not null default 'pilot',
  conversation_limit int not null default 500 check (conversation_limit >= 0),
  overage_policy overage_policy not null default 'pause_ai',
  pilot_ends_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  gstin text,
  billing_name text,
  billing_address text,
  alert_daily_spend_inr numeric(14,2),
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users on delete cascade,
  tenant_id uuid references tenants on delete cascade,
  role user_role not null,
  name text not null default '',
  email text not null,
  created_at timestamptz not null default now(),
  check ((role = 'platform_admin') = (tenant_id is null))
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  type channel_type not null,
  provider channel_provider not null,
  status channel_status not null default 'not_connected',
  external_id text,
  config jsonb not null default '{}',
  credentials_encrypted text,
  last_error text,
  connected_by uuid references users on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (type, external_id)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  name text not null default '',
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email = lower(email)),
  slack_user_id text,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, email),
  unique (tenant_id, slack_user_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  channel_id uuid not null references channels on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  external_thread_id text not null,
  status conversation_status not null default 'open',
  assignee_id uuid references users on delete set null,
  ai_paused boolean not null default false,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  unread_count int not null default 0,
  summary text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, external_thread_id)
);
create index on conversations (tenant_id, status, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  conversation_id uuid not null references conversations on delete cascade,
  direction message_direction not null,
  sender_type sender_type not null,
  sender_user_id uuid references users on delete set null,
  body text not null default '',
  attachments jsonb not null default '[]',
  provider_message_id text,
  email_message_id text,
  in_reply_to text,
  status message_status not null default 'received',
  error text,
  is_template boolean not null default false,
  template_name text,
  intent intent,
  ai_confidence numeric(4,3),
  search tsvector generated always as (to_tsvector('simple', body)) stored,
  created_at timestamptz not null default now(),
  unique (conversation_id, provider_message_id)
);
create index on messages (conversation_id, created_at);
create index on messages using gin (search);
create index on messages (provider_message_id) where provider_message_id is not null;

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes int not null,
  status document_status not null default 'uploaded',
  error text,
  uploaded_by uuid references users on delete set null,
  created_at timestamptz not null default now()
);

-- vector(1024) must equal EMBEDDING_DIM (voyage-3.5-lite default).
create table chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  document_id uuid not null references documents on delete cascade,
  idx int not null,
  content text not null,
  token_count int not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks (tenant_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  conversation_id uuid references conversations on delete set null,
  name text not null default '',
  phone text,
  email text,
  intent intent not null,
  source_channel channel_type not null,
  status lead_status not null default 'new',
  notes text,
  created_at timestamptz not null default now()
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  conversation_id uuid references conversations on delete set null,
  type reminder_type not null,
  due_at timestamptz not null,
  status reminder_status not null default 'scheduled',
  message text not null default '',
  template_name text,
  created_by uuid references users on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table rates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric(14,6) not null check (value >= 0),
  currency currency not null,
  unit text not null,
  effective_from timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  unique (key, effective_from)
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  conversation_id uuid references conversations on delete set null,
  channel channel_type,
  event_type usage_event_type not null,
  quantity numeric(14,3) not null check (quantity >= 0),
  rate_id uuid references rates,
  unit_cost_inr numeric(14,6) not null default 0,
  total_cost_inr numeric(14,6) not null default 0,
  model text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on usage_events (tenant_id, created_at);
create index on usage_events (conversation_id);
-- One billed conversation per calendar month (IST, see lib/metering.ts).
create unique index usage_events_conversation_month on usage_events
  (conversation_id, date_trunc('month', timezone('Asia/Kolkata', created_at)))
  where event_type = 'conversation_billed';

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  plan plan not null,
  razorpay_subscription_id text unique,
  razorpay_customer_id text,
  status subscription_status not null default 'created',
  amount_paise bigint not null check (amount_paise >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  subscription_id uuid references subscriptions on delete set null,
  number text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  subtotal_paise bigint not null,
  meta_fees_paise bigint not null default 0,
  overage_paise bigint not null default 0,
  gst_paise bigint not null,
  total_paise bigint not null,
  status invoice_status not null default 'draft',
  razorpay_payment_id text,
  lines jsonb not null default '[]',
  pdf_path text,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants on delete cascade,
  actor_type actor_type not null,
  actor_user_id uuid references users on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_log (tenant_id, created_at);

create table webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ── RLS ────────────────────────────────────────────────────────────────
create function current_tenant_id() returns uuid
  language sql stable security definer set search_path = public
  as $$ select tenant_id from users where id = auth.uid() $$;

create function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce((select role = 'platform_admin' from users where id = auth.uid()), false) $$;

create function is_owner() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce((select role = 'owner' from users where id = auth.uid()), false) $$;

do $$
declare t text;
begin
  -- Plain tenant tables: any member of the tenant (owner or agent) has full access.
  foreach t in array array['contacts','conversations','messages','documents','chunks','leads','reminders'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_all on %I for all to authenticated
      using (tenant_id = current_tenant_id() or is_platform_admin())
      with check (tenant_id = current_tenant_id() or is_platform_admin())$p$, t);
  end loop;
  -- Owner-managed tables: members read, owners write.
  foreach t in array array['channels','subscriptions','invoices','usage_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_read on %I for select to authenticated
      using (tenant_id = current_tenant_id() or is_platform_admin())$p$, t);
  end loop;
end $$;

create policy owner_write on channels for all to authenticated
  using ((tenant_id = current_tenant_id() and is_owner()) or is_platform_admin())
  with check ((tenant_id = current_tenant_id() and is_owner()) or is_platform_admin());
-- subscriptions, invoices, usage_events: written only by server jobs (service role).
create policy admin_write on subscriptions for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy admin_write on invoices for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

alter table tenants enable row level security;
create policy tenant_read on tenants for select to authenticated
  using (id = current_tenant_id() or is_platform_admin());
create policy owner_update on tenants for update to authenticated
  using ((id = current_tenant_id() and is_owner()) or is_platform_admin())
  with check ((id = current_tenant_id() and is_owner()) or is_platform_admin());

alter table users enable row level security;
create policy tenant_read on users for select to authenticated
  using (id = auth.uid() or tenant_id = current_tenant_id() or is_platform_admin());
create policy owner_write on users for all to authenticated
  using ((tenant_id = current_tenant_id() and is_owner()) or is_platform_admin())
  with check ((tenant_id = current_tenant_id() and is_owner() and role <> 'platform_admin') or is_platform_admin());

-- Owners must not change their own plan, limits or status; only admins/jobs do.
create function guard_tenant_billing_fields() returns trigger language plpgsql as $$
begin
  if not is_platform_admin() and current_user = 'authenticated' and
     (new.plan, new.status, new.conversation_limit, new.overage_policy, new.pilot_ends_at, new.slug)
     is distinct from (old.plan, old.status, old.conversation_limit, old.overage_policy, old.pilot_ends_at, old.slug) then
    raise exception 'only platform admins can change plan, status, limits or slug';
  end if;
  return new;
end $$;
create trigger tenants_guard before update on tenants for each row execute function guard_tenant_billing_fields();

alter table rates enable row level security;
create policy read_all on rates for select to authenticated using (true);
create policy admin_write on rates for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- Append-only: insert own-tenant rows, read own tenant; no update/delete policies.
alter table audit_log enable row level security;
create policy tenant_read on audit_log for select to authenticated
  using (tenant_id = current_tenant_id() or is_platform_admin());
create policy tenant_insert on audit_log for insert to authenticated
  with check ((tenant_id = current_tenant_id() and actor_user_id = auth.uid()) or is_platform_admin());

-- No policies: service role only.
alter table webhook_events enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on webhook_events from authenticated, anon;
revoke update, delete on audit_log from authenticated;
