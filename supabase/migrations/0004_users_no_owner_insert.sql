-- Owners could insert a users row for ANY auth id and pull that login into their tenant.
-- There is no invite flow yet, so owners may only update/remove existing members.
drop policy owner_write on users;
create policy owner_update on users for update to authenticated
  using ((tenant_id = current_tenant_id() and is_owner()) or is_platform_admin())
  with check ((tenant_id = current_tenant_id() and is_owner() and role <> 'platform_admin') or is_platform_admin());
create policy owner_delete on users for delete to authenticated
  using ((tenant_id = current_tenant_id() and is_owner()) or is_platform_admin());
