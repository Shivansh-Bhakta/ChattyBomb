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
