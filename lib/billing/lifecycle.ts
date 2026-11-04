import { asService } from "../db.ts";
import { sendMail } from "../mailer.ts";

/**
 * Ends expired pilots: tenants still on 'pilot' past pilot_ends_at without a live subscription are
 * suspended (AI paused; the team keeps inbox access) and get the pilot-end hook (missed-leads report, M12).
 */
export async function expirePilots(onExpired: (tenantId: string) => Promise<unknown> = async () => {}) {
  const { rows } = await asService((db) => db.query( // scope: platform-job
    `update tenants t set status = 'suspended'
      where t.status = 'pilot' and t.pilot_ends_at < now()
        and not exists (select 1 from subscriptions s where s.tenant_id = t.id and s.status in ('active', 'halted'))
      returning t.id`));
  for (const r of rows) {
    await asService((db) => db.query(`insert into audit_log (tenant_id, actor_type, action, target_type, target_id) values ($1, 'system', 'pilot.expired', 'tenant', $1)`, [r.id])); // scope: tenant
    await onExpired(r.id).catch((e) => console.error("[pilot] end hook failed for", r.id, (e as Error).message));
  }
  return rows.map((r) => r.id as string);
}

/** "Pause AI and notify": emails the owners once per month when the plan limit is reached. */
export async function notifyLimitReached(tenantId: string) {
  const owners = await asService(async (db) => { // scope: tenant
    const claim = await db.query(
      `insert into audit_log (tenant_id, actor_type, action, target_type, target_id, metadata)
       select $1, 'system', 'limit.notified', 'tenant', $1, jsonb_build_object('month', to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM'))
        where not exists (select 1 from audit_log where tenant_id = $1 and action = 'limit.notified'
                            and metadata->>'month' = to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM'))`, [tenantId]);
    if (!claim.rowCount) return [];
    return (await db.query(`select u.email, t.name, t.conversation_limit from users u join tenants t on t.id = u.tenant_id where u.tenant_id = $1 and u.role = 'owner'`, [tenantId])).rows;
  });
  for (const o of owners) {
    await sendMail(o.email, `${o.name}: conversation limit reached, AI replies paused`,
      `You have used all ${o.conversation_limit} conversations in your plan this month. AI replies are paused until next month; your team can still reply from the inbox. Upgrade your plan in Settings to resume AI replies now.`)
      .catch((e) => console.error("[limit notice]", (e as Error).message));
  }
  return owners.length;
}
