import { asService, type Db } from "./db.ts";
import { sendMail } from "./mailer.ts";

// shortcut: one business-hours window for every tenant (9:00-20:00 IST, Sunday closed); move to per-tenant hours when asked.
export const OPEN_HOUR = 9, CLOSE_HOUR = 20;
const AFTER_HOURS = `(extract(hour from timezone('Asia/Kolkata', m.created_at)) < ${OPEN_HOUR}
  or extract(hour from timezone('Asia/Kolkata', m.created_at)) >= ${CLOSE_HOUR}
  or extract(isodow from timezone('Asia/Kolkata', m.created_at)) = 7)`;
const AI_ANSWERED = `exists (select 1 from messages r where r.conversation_id = m.conversation_id and r.direction = 'outbound'
  and r.sender_type = 'ai' and r.status not in ('failed', 'sending') and r.created_at >= m.created_at)`;

export type PilotStats = {
  leads_captured: number; booking_enquiries: number; bookings_handled: number;
  after_hours_messages: number; after_hours_answered: number;
  conversations: number; ai_replies: number; handed_to_human: number;
};

/** Pilot numbers for [start, end). Works under RLS (asUser) or service with the tenant filter. */
export async function pilotStats(db: Db, tenantId: string, start: Date, end: Date): Promise<PilotStats> {
  const { rows: [s] } = await db.query(
    `select
       (select count(*) from leads where tenant_id = $1 and created_at >= $2 and created_at < $3)::int as leads_captured,
       (select count(*) from messages m where m.tenant_id = $1 and m.direction = 'inbound' and m.intent = 'booking' and m.created_at >= $2 and m.created_at < $3)::int as booking_enquiries,
       (select count(*) from messages m where m.tenant_id = $1 and m.direction = 'inbound' and m.intent = 'booking' and m.created_at >= $2 and m.created_at < $3 and ${AI_ANSWERED})::int as bookings_handled,
       (select count(*) from messages m where m.tenant_id = $1 and m.direction = 'inbound' and m.created_at >= $2 and m.created_at < $3 and ${AFTER_HOURS})::int as after_hours_messages,
       (select count(*) from messages m where m.tenant_id = $1 and m.direction = 'inbound' and m.created_at >= $2 and m.created_at < $3 and ${AFTER_HOURS} and ${AI_ANSWERED})::int as after_hours_answered,
       (select count(distinct m.conversation_id) from messages m where m.tenant_id = $1 and m.direction = 'inbound' and m.created_at >= $2 and m.created_at < $3)::int as conversations,
       (select count(*) from messages m where m.tenant_id = $1 and m.direction = 'outbound' and m.sender_type = 'ai' and m.status not in ('failed', 'sending') and m.created_at >= $2 and m.created_at < $3)::int as ai_replies,
       (select count(*) from audit_log where tenant_id = $1 and action = 'ai.handoff' and created_at >= $2 and created_at < $3)::int as handed_to_human`,
    [tenantId, start, end]);
  return s;
}

/** Creates the pilot-end report once and emails the owners a summary. Safe to call again. */
export async function generatePilotReport(tenantId: string) {
  const created = await asService(async (db) => { // scope: tenant
    const { rows: [t] } = await db.query(`select name, created_at, coalesce(pilot_ends_at, now()) as ends from tenants where id = $1`, [tenantId]);
    if (!t) return null;
    const end = new Date(Math.min(new Date(t.ends).getTime(), Date.now()));
    const stats = await pilotStats(db, tenantId, t.created_at, end);
    const { rows: [r] } = await db.query(
      `insert into pilot_reports (tenant_id, period_start, period_end, stats) values ($1, $2, $3, $4) on conflict (tenant_id) do nothing returning id`,
      [tenantId, t.created_at, end, stats]);
    if (!r) return null;
    const { rows: owners } = await db.query(`select email from users where tenant_id = $1 and role = 'owner'`, [tenantId]);
    return { name: t.name as string, stats, owners: owners.map((o) => o.email as string) };
  });
  if (!created) return false;
  const s = created.stats;
  const text = [
    `Your ChattyBomb pilot for ${created.name} has ended. Here is what the assistant did:`,
    `- Leads captured: ${s.leads_captured}`,
    `- Booking enquiries handled: ${s.bookings_handled} of ${s.booking_enquiries}`,
    `- After-hours messages answered: ${s.after_hours_answered} of ${s.after_hours_messages} (before ${OPEN_HOUR}am, after ${CLOSE_HOUR - 12}pm, or Sunday)`,
    `- Conversations: ${s.conversations}, AI replies: ${s.ai_replies}, handed to your team: ${s.handed_to_human}`,
    ``, `Choose a plan in Settings to keep the assistant answering.`,
  ].join("\n");
  for (const to of created.owners) await sendMail(to, `${created.name}: your 14-day pilot report`, text).catch((e) => console.error("[pilot report mail]", (e as Error).message));
  return true;
}
