import { z } from "zod";
import { WindowClosedError, sendMessage } from "./channels/outbound.ts";
import { templatesOf } from "./channels/templates.ts";
import { asService, type Db } from "./db.ts";

export const reminderSchema = z.object({
  conversationId: z.guid(),
  type: z.enum(["callback", "appointment", "renewal", "follow_up"]),
  // datetime-local from the browser, interpreted in IST.
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).transform((s) => new Date(`${s}:00+05:30`)),
  message: z.string().trim().max(1000).default(""),
  templateName: z.string().trim().max(512).optional().transform((v) => v || null),
});

/** Runs under asUser (RLS): the conversation must belong to the caller's tenant. */
export async function createReminder(db: Db, userId: string, input: unknown) {
  const r = reminderSchema.parse(input);
  if (!r.message && !r.templateName) throw new Error("a reminder needs a message or a template");
  const { rows: [row] } = await db.query(
    `insert into reminders (tenant_id, contact_id, conversation_id, type, due_at, message, template_name, created_by)
     select tenant_id, contact_id, id, $2, $3, $4, $5, $6 from conversations where id = $1 returning id`,
    [r.conversationId, r.type, r.dueAt, r.message, r.templateName, userId],
  );
  if (!row) throw new Error("conversation not found");
  return row.id as string;
}

/**
 * Sends every due reminder once. Each row is claimed (status → sent) before sending, so a
 * crash or a concurrent run can never send it twice; a failed send is marked failed with the reason.
 * Free-form text inside the WhatsApp 24h window, otherwise the reminder's approved template.
 */
export async function sendDueReminders(limit = 100) {
  const { rows: due } = await asService((db) => db.query( // scope: platform-job (all tenants; each send re-checks tenant)
    `update reminders r set status = 'sent', sent_at = now()
       where r.id in (select id from reminders where status = 'scheduled' and due_at <= now() order by due_at limit $1 for update skip locked)
     returning r.id, r.tenant_id, r.conversation_id, r.message, r.template_name,
       (select ch.config from conversations c join channels ch on ch.id = c.channel_id where c.id = r.conversation_id) as channel_config,
       (select ct.name from contacts ct where ct.id = r.contact_id) as contact_name`,
    [limit],
  ));
  let sent = 0;
  for (const r of due) {
    try {
      if (!r.conversation_id) throw new Error("reminder has no conversation");
      try {
        if (!r.message) throw new WindowClosedError();
        await sendMessage(r.tenant_id, r.conversation_id, { kind: "text", text: r.message }, { type: "system" });
      } catch (e) {
        if (!(e instanceof WindowClosedError)) throw e;
        const t = templatesOf(r.channel_config).find((x) => x.name === r.template_name);
        if (!t) throw new Error("24-hour window closed and no approved template set");
        await sendMessage(r.tenant_id, r.conversation_id, { kind: "template", ...t, params: [r.contact_name || "there"] }, { type: "system" });
      }
      sent++;
    } catch (e) {
      await asService((db) => db.query(`update reminders set status = 'failed', error = $2 where id = $1 and tenant_id = $3`, [r.id, (e as Error).message.slice(0, 300), r.tenant_id])); // scope: tenant
    }
  }
  return { due: due.length, sent };
}
