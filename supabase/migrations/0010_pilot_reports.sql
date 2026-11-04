-- "Missed leads" report generated when a pilot ends (one per tenant).
create table pilot_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  stats jsonb not null,
  created_at timestamptz not null default now()
);
alter table pilot_reports enable row level security;
create policy tenant_read on pilot_reports for select to authenticated using (tenant_id = current_tenant_id() or is_platform_admin());
grant select on pilot_reports to authenticated;

-- Where the signup came from (e.g. ?ref=landing on the landing page's "Start free pilot").
alter table tenants add column signup_source text check (signup_source ~ '^[a-z0-9_-]{1,40}$');
