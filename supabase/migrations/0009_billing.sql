-- One invoice per tenant per billing period; numbers from one platform-wide sequence.
create unique index invoices_one_per_period on invoices (tenant_id, period_start);
create sequence invoice_seq;
-- At most one live subscription per tenant.
create unique index subscriptions_one_live on subscriptions (tenant_id) where status in ('created', 'active', 'halted');
