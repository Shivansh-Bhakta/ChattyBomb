import { z } from "zod";
import { assertPlatformAdmin } from "./admin.ts";
import { asService, type Db } from "./db.ts";
import { mockMail, sendMail } from "./mailer.ts";

export const alertSettingsSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  dailyAiSpendInr: z.coerce.number().min(0).max(10_000_000).optional(),
  tenantDailySpendInr: z.coerce.number().min(0).max(10_000_000).optional(),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

export async function getAlertSettings(db: Db): Promise<AlertSettings> {
  const { rows: [r] } = await db.query(`select value from platform_settings where key = 'alerts'`);
  return alertSettingsSchema.catch({}).parse(r?.value ?? {});
}

export async function setAlertSettings(actorId: string, input: unknown) {
  const s = alertSettingsSchema.parse(input);
  await asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    await db.query(`insert into platform_settings (key, value) values ('alerts', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`, [s]);
    await db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action, metadata) values (null, 'platform_admin', $1, 'admin.set_alerts', $2)`, [actorId, s]);
  });
}

export const mockAlerts = mockMail;
const sendAlert = sendMail;

/**
 * Emails the platform owner when today's (IST) total AI spend, or one tenant's total spend, crosses
 * a threshold. Each alert is sent at most once per day per kind/tenant (deduped through audit_log).
 */
export async function checkSpendAlerts() {
  const sent: string[] = [];
  const { settings, totalAi, tenants } = await asService(async (db) => { // scope: platform-job
    const settings = await getAlertSettings(db);
    const today = `timezone('Asia/Kolkata', created_at)::date = timezone('Asia/Kolkata', now())::date`;
    const { rows: [t] } = await db.query(`select coalesce(sum(total_cost_inr), 0)::float as ai from usage_events
      where ${today} and event_type in ('ai_input_tokens','ai_output_tokens','ai_cached_tokens','embedding_tokens')`);
    const { rows: tenants } = await db.query(`select u.tenant_id, t.name, t.alert_daily_spend_inr::float as threshold, sum(u.total_cost_inr)::float as spend
      from usage_events u join tenants t on t.id = u.tenant_id where ${today.replaceAll("created_at", "u.created_at")} group by u.tenant_id, t.name, t.alert_daily_spend_inr`);
    return { settings, totalAi: t.ai as number, tenants };
  });
  const candidates: { kind: string; tenantId: string | null; subject: string; text: string }[] = [];
  if (settings.dailyAiSpendInr !== undefined && totalAi > settings.dailyAiSpendInr) {
    candidates.push({ kind: "daily_ai_spend", tenantId: null, subject: `AI spend today ₹${totalAi.toFixed(2)} > ₹${settings.dailyAiSpendInr}`,
      text: `Total AI spend today (IST) is ₹${totalAi.toFixed(2)}, above your threshold of ₹${settings.dailyAiSpendInr}. Estimates: tokens x rates table.` });
  }
  for (const t of tenants) {
    const threshold = t.threshold ?? settings.tenantDailySpendInr;
    if (threshold !== undefined && threshold !== null && t.spend > threshold) {
      candidates.push({ kind: "tenant_daily_spend", tenantId: t.tenant_id, subject: `${t.name}: spend today ₹${t.spend.toFixed(2)} > ₹${threshold}`,
        text: `Tenant ${t.name} (${t.tenant_id}) has spent ₹${t.spend.toFixed(2)} today (AI + Meta), above ₹${threshold}.` });
    }
  }
  if (!candidates.length) return sent;
  if (!settings.email) {
    console.error(`[alerts] ${candidates.length} spend alert(s) but no alert email is set in /admin`);
    return sent;
  }
  for (const c of candidates) {
    // Claim first (one row per day/kind/tenant), then send; a failed send releases the claim.
    const claimed = await asService(async (db) => { // scope: platform-job
      const { rows: [dup] } = await db.query(
        `select 1 from audit_log where action = 'alert.sent' and metadata->>'kind' = $1 and coalesce(metadata->>'tenant_id', '') = coalesce($2, '')
           and metadata->>'day' = to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM-DD')`, [c.kind, c.tenantId]);
      if (dup) return null;
      const { rows: [row] } = await db.query(
        `insert into audit_log (tenant_id, actor_type, action, metadata) values (null, 'system', 'alert.sent', jsonb_build_object('kind', $1::text, 'tenant_id', $2::text, 'day', to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM-DD'), 'subject', $3::text)) returning id`,
        [c.kind, c.tenantId, c.subject]);
      return row.id as string;
    });
    if (!claimed) continue;
    try {
      await sendAlert(settings.email, c.subject, c.text);
      sent.push(c.subject);
    } catch (e) {
      console.error("[alerts] send failed", (e as Error).message);
      await asService((db) => db.query(`delete from audit_log where id = $1 and action = 'alert.sent'`, [claimed])); // scope: platform-job
    }
  }
  return sent;
}
