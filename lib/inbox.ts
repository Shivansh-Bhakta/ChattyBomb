import { z } from "zod";
import type { Db } from "./db.ts";

export const STATUSES = ["open", "waiting_on_customer", "needs_human", "resolved"] as const;
export const CHANNELS = ["whatsapp", "slack", "email"] as const;

export const filtersSchema = z.object({
  status: z.enum(STATUSES).optional().catch(undefined),
  channel: z.enum(CHANNELS).optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  c: z.guid().optional().catch(undefined),
});
export type Filters = z.infer<typeof filtersSchema>;

/** Runs under asUser, so RLS scopes every row to the caller's tenant. */
export async function listConversations(db: Db, f: Filters) {
  const { rows } = await db.query(
    `select c.id, c.status, c.unread_count, c.last_message_at, c.ai_paused, ch.type as channel,
            ct.name as contact_name, coalesce(ct.phone, ct.email, ct.slack_user_id) as contact_handle,
            u.name as assignee_name,
            (select body from messages m where m.conversation_id = c.id and m.direction <> 'note' order by created_at desc limit 1) as last_body
       from conversations c
       join channels ch on ch.id = c.channel_id
       join contacts ct on ct.id = c.contact_id
       left join users u on u.id = c.assignee_id
      where ($1::conversation_status is null or c.status = $1)
        and ($2::channel_type is null or ch.type = $2)
        and ($3::text is null or ct.name ilike '%' || $3 || '%' or ct.phone like '%' || $3 || '%' or ct.email ilike '%' || $3 || '%'
             or exists (select 1 from messages m where m.conversation_id = c.id and m.search @@ plainto_tsquery('simple', $3)))
      order by c.last_message_at desc
      limit 100`,
    [f.status ?? null, f.channel ?? null, f.q || null],
  );
  return rows;
}

export async function getThread(db: Db, conversationId: string) {
  const { rows: [conv] } = await db.query(
    `select c.*, ch.type as channel, ct.name as contact_name, ct.phone, ct.email
       from conversations c join channels ch on ch.id = c.channel_id join contacts ct on ct.id = c.contact_id
      where c.id = $1`,
    [conversationId],
  );
  if (!conv) return null;
  const { rows: messages } = await db.query(
    `select m.id, m.direction, m.sender_type, m.body, m.status, m.created_at, m.intent, u.name as sender_name
       from messages m left join users u on u.id = m.sender_user_id
      where m.conversation_id = $1 order by m.created_at`,
    [conversationId],
  );
  const { rows: team } = await db.query(`select id, name from users where tenant_id = $1 order by name`, [conv.tenant_id]);
  return { conv, messages, team };
}
