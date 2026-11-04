import { randomBytes } from "node:crypto";
import { z } from "zod";
import { asService } from "./db.ts";

export const PLAN_LIMITS = { starter: 500, growth: 2000 } as const;
export const PILOT_DAYS = 14;

export const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(1).max(200),
});

/** Creates a pilot tenant with the given auth user as owner. One tenant per user. */
export async function createTenant(authUserId: string, email: string, input: z.infer<typeof onboardingSchema>) {
  const { businessName, ownerName } = onboardingSchema.parse(input);
  const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${randomBytes(3).toString("hex")}`;
  return asService(async (db) => {
    const existing = await db.query("select 1 from users where id = $1", [authUserId]);
    if (existing.rowCount) throw new Error("user already belongs to a tenant");
    const { rows: [t] } = await db.query(
      `insert into tenants (name, slug, plan, status, conversation_limit, pilot_ends_at)
       values ($1, $2, 'starter', 'pilot', $3, now() + make_interval(days => $4)) returning id`,
      [businessName, slug, PLAN_LIMITS.starter, PILOT_DAYS],
    );
    await db.query(`insert into users (id, tenant_id, role, name, email) values ($1, $2, 'owner', $3, $4)`, [authUserId, t.id, ownerName, email]);
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id) values ($1, 'user', $2, 'tenant.create', 'tenant', $1)`,
      [t.id, authUserId],
    );
    return t.id as string;
  });
}

/**
 * Permanently deletes a tenant and all its data (every tenant table cascades), its stored files
 * and its users' logins. Leaves one tenant-less audit row as proof of deletion.
 */
export async function deleteTenant(tenantId: string, actorUserId: string, confirmName: string) {
  const { rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { env, secret } = await import("./env.ts");
  const { userIds, name } = await asService(async (db) => {
    const { rows: [t] } = await db.query(`select name from tenants where id = $1 for update`, [tenantId]);
    if (!t) throw new Error("tenant not found");
    if (confirmName.trim() !== t.name) throw new Error("confirmation does not match the business name");
    const { rows: [actor] } = await db.query(`select role, tenant_id from users where id = $1`, [actorUserId]);
    if (!(actor?.role === "platform_admin" || (actor?.role === "owner" && actor.tenant_id === tenantId))) throw new Error("only the owner can delete this business");
    const { rows: users } = await db.query(`select id from users where tenant_id = $1`, [tenantId]);
    await db.query(`delete from tenants where id = $1`, [tenantId]);
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata)
       values (null, $1, $2, 'tenant.delete', 'tenant', $3, $4)`,
      [actor.role === "platform_admin" ? "platform_admin" : "user", actor.role === "platform_admin" ? actorUserId : null, tenantId, { name: t.name, users: users.length }],
    );
    return { userIds: users.map((u) => u.id as string), name: t.name as string };
  });

  // Files and logins live outside Postgres; best effort after the data is gone, errors surfaced.
  const problems: string[] = [];
  if (env().MOCK_MODE) {
    await rm(join(process.cwd(), ".mock-storage", "tenants", tenantId), { recursive: true, force: true });
    await asService((db) => db.query(`delete from auth.users where id = any($1::uuid[])`, [userIds]));
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(env().NEXT_PUBLIC_SUPABASE_URL!, secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: files, error } = await sb.storage.from("documents").list(`tenants/${tenantId}`, { limit: 1000 });
    if (error) problems.push(`storage list: ${error.message}`);
    if (files?.length) {
      const { error: e } = await sb.storage.from("documents").remove(files.map((f) => `tenants/${tenantId}/${f.name}`));
      if (e) problems.push(`storage remove: ${e.message}`);
    }
    for (const id of userIds) {
      const { error: e } = await sb.auth.admin.deleteUser(id);
      if (e) problems.push(`auth user ${id}: ${e.message}`);
    }
  }
  if (problems.length) console.error("[deleteTenant] leftovers for", tenantId, problems);
  return { name, problems };
}
