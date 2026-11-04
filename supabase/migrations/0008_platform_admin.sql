-- Platform-owner settings (alert thresholds, alert email). Service-role only: no grants, no policies.
create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;
