-- Outbound send state: 'sending' is recorded before the provider call. A retry that finds
-- 'sending' does not resend (the provider may already have delivered it).
alter type message_status add value if not exists 'sending' after 'queued';
alter table messages add column idempotency_key text;
create unique index messages_idempotency_key on messages (tenant_id, idempotency_key) where idempotency_key is not null;
