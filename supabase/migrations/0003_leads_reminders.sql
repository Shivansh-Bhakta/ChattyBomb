-- One lead per conversation (re-classification of later messages must not duplicate it).
create unique index leads_one_per_conversation on leads (conversation_id) where conversation_id is not null;
-- Why a reminder failed (e.g. 24h window closed and no template).
alter table reminders add column error text;
create index on reminders (status, due_at) where status = 'scheduled';
