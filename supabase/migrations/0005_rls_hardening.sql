-- RLS hardening (review of 0001/0004). Supabase exposes these tables through PostgREST with the
-- user's JWT, so table grants + RLS are the real API surface, not just our server actions.

-- 1. Least-privilege grants: authenticated users get only the columns the app writes.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on tenants, users, channels, contacts, conversations, messages, documents, chunks,
  leads, reminders, subscriptions, invoices, audit_log, rates to authenticated;
-- Tenants see what they used, never our unit costs, rate ids or internal metadata.
grant select (id, tenant_id, conversation_id, channel, event_type, quantity, created_at) on usage_events to authenticated;

grant update (name, gstin, billing_name, billing_address, timezone) on tenants to authenticated;
grant update (name, role), delete on users to authenticated;                 -- never id/tenant_id/email
grant update (config) on channels to authenticated;                         -- never external_id/credentials/status
grant update (name, notes) on contacts to authenticated;
grant update (status, assignee_id, ai_paused, unread_count, resolved_at) on conversations to authenticated; -- not last_inbound_at (24h window)
grant insert (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status) on messages to authenticated; -- notes only, see trigger
grant delete on documents to authenticated;
grant update (status, notes) on leads to authenticated;
grant insert (tenant_id, contact_id, conversation_id, type, due_at, message, template_name, created_by), update (status) on reminders to authenticated;
grant insert (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) on audit_log to authenticated;

-- 2. Audit entries written by users are always actor_type 'user' and their own id.
drop policy tenant_insert on audit_log;
create policy tenant_insert on audit_log for insert to authenticated
  with check (tenant_id = current_tenant_id() and actor_type = 'user' and actor_user_id = auth.uid());

-- 3. Rates (our costs) are platform-admin only.
drop policy read_all on rates;
create policy admin_read on rates for select to authenticated using (is_platform_admin());

-- 4. Cross-tenant references and impersonation. Runs for every role (service code included),
--    so a row can never point at another tenant's rows; user-written rows must be the caller's own.
create function enforce_tenant_refs() returns trigger language plpgsql set search_path = public as $$
declare
  is_user boolean := current_user = 'authenticated';
begin
  if tg_table_name = 'conversations' then
    perform 1 from channels where id = new.channel_id and tenant_id = new.tenant_id; if not found then raise exception 'channel belongs to another tenant'; end if;
    perform 1 from contacts where id = new.contact_id and tenant_id = new.tenant_id; if not found then raise exception 'contact belongs to another tenant'; end if;
    if new.assignee_id is not null then
      perform 1 from users where id = new.assignee_id and tenant_id = new.tenant_id; if not found then raise exception 'assignee belongs to another tenant'; end if;
    end if;
  elsif tg_table_name = 'messages' then
    perform 1 from conversations where id = new.conversation_id and tenant_id = new.tenant_id; if not found then raise exception 'conversation belongs to another tenant'; end if;
    if new.sender_user_id is not null then
      perform 1 from users where id = new.sender_user_id and tenant_id = new.tenant_id; if not found then raise exception 'sender belongs to another tenant'; end if;
    end if;
    if is_user and not (new.direction = 'note' and new.sender_type = 'agent' and new.sender_user_id = auth.uid()) then
      raise exception 'users may only add their own internal notes';
    end if;
  elsif tg_table_name in ('leads', 'reminders') then
    perform 1 from contacts where id = new.contact_id and tenant_id = new.tenant_id; if not found then raise exception 'contact belongs to another tenant'; end if;
    if new.conversation_id is not null then
      perform 1 from conversations where id = new.conversation_id and tenant_id = new.tenant_id and contact_id = new.contact_id;
      if not found then raise exception 'conversation belongs to another tenant or contact'; end if;
    end if;
    if tg_table_name = 'reminders' and is_user and tg_op = 'INSERT' then
      if new.created_by is distinct from auth.uid() then raise exception 'reminders must be created as yourself'; end if;
    end if;
  elsif tg_table_name = 'chunks' then
    perform 1 from documents where id = new.document_id and tenant_id = new.tenant_id; if not found then raise exception 'document belongs to another tenant'; end if;
  elsif tg_table_name = 'documents' then
    if new.uploaded_by is not null then
      perform 1 from users where id = new.uploaded_by and (tenant_id = new.tenant_id or role = 'platform_admin');
      if not found then raise exception 'uploader belongs to another tenant'; end if;
    end if;
  elsif tg_table_name = 'channels' then
    if new.connected_by is not null then
      perform 1 from users where id = new.connected_by and (tenant_id = new.tenant_id or role = 'platform_admin');
      if not found then raise exception 'connecting user belongs to another tenant'; end if;
    end if;
  elsif tg_table_name = 'usage_events' then
    if new.conversation_id is not null then
      perform 1 from conversations where id = new.conversation_id and tenant_id = new.tenant_id; if not found then raise exception 'conversation belongs to another tenant'; end if;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['conversations','messages','leads','reminders','chunks','documents','channels','usage_events'] loop
    execute format('create trigger enforce_tenant_refs before insert or update on %I for each row execute function enforce_tenant_refs()', t);
  end loop;
end $$;
