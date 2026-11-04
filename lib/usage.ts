import type { Db } from "./db.ts";
import { conversationsThisMonth } from "./metering.ts";

export const WARN_AT = 0.8;

/** Tenant-facing usage (no costs or margins: those are platform-owner only). Caller scopes by tenant. */
export async function usageSummary(db: Db, tenantId: string) {
  const { rows: [t] } = await db.query(`select name, plan, status, conversation_limit, overage_policy, pilot_ends_at from tenants where id = $1`, [tenantId]);
  if (!t) throw new Error("tenant not found");
  const used = await conversationsThisMonth(db, tenantId);
  const { rows: byChannel } = await db.query(
    `select channel, count(*)::int as conversations from usage_events
      where tenant_id = $1 and event_type = 'conversation_billed'
        and date_trunc('month', timezone('Asia/Kolkata', created_at)) = date_trunc('month', timezone('Asia/Kolkata', now()))
      group by channel order by channel`, [tenantId]);
  const limit: number = t.conversation_limit;
  const ratio = limit > 0 ? used / limit : 1;
  return {
    ...t, used, limit, byChannel,
    pct: Math.round(ratio * 100),
    warn: ratio >= WARN_AT,
    over: used > limit,
    aiPaused: used > limit && t.overage_policy === "pause_ai",
  };
}
