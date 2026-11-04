-- Reviewer findings on 0005.
-- (7) Platform admins may write audit entries through their own session, as platform_admin.
drop policy tenant_insert on audit_log;
create policy tenant_insert on audit_log for insert to authenticated
  with check (
    (tenant_id = current_tenant_id() and actor_type = 'user' and actor_user_id = auth.uid())
    or (is_platform_admin() and actor_type = 'platform_admin' and actor_user_id = auth.uid())
  );

-- (8) Members must not read stored channel credentials (even encrypted).
revoke select on channels from authenticated;
grant select (id, tenant_id, type, provider, status, external_id, config, last_error, connected_by, connected_at, created_at) on channels to authenticated;
