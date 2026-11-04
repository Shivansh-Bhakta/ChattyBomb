import { asService } from "../db.ts";
import { markConversationBilled, type Channel } from "../metering.ts";
import { enqueue } from "../queue.ts";
import type { InboundMessage, StatusUpdate } from "./types.ts";

/**
 * Stores inbound messages. Each message is one transaction: dedupe (webhook_events) + contact
 * merge + conversation upsert + message insert + monthly conversation count. A failure rolls
 * back the dedupe row too, so the provider's retry is processed instead of silently dropped.
 */
export async function ingestMessages(provider: string, type: Channel, messages: InboundMessage[]) {
  const stored: { tenantId: string; messageId: string }[] = [];
  for (const m of messages) {
    const row = await asService(async (db) => { // scope: webhook-lookup (tenant resolved from channels.external_id, then every write uses it)
      const { rows: [ch] } = await db.query(`select id, tenant_id from channels where type = $1 and external_id = $2 and status = 'connected'`, [type, m.channelExternalId]);
      if (!ch) {
        console.warn(`[inbound] no connected ${type} channel for ${m.channelExternalId}`);
        return null;
      }
      const fresh = await db.query(`insert into webhook_events (provider, event_id) values ($1, $2) on conflict do nothing`, [provider, `msg:${m.providerMessageId}`]);
      if (!fresh.rowCount) return null; // duplicate delivery

      const t = ch.tenant_id;
      const contactId = await upsertContact(db, t, m.from);
      const { rows: [conv] } = await db.query(
        `insert into conversations (tenant_id, channel_id, contact_id, external_thread_id, last_message_at, last_inbound_at, unread_count)
         values ($1, $2, $3, $4, now(), now(), 1)
         on conflict (channel_id, external_thread_id) do update set
           last_message_at = now(), last_inbound_at = now(), unread_count = conversations.unread_count + 1,
           status = case when conversations.status in ('resolved', 'waiting_on_customer') then 'open'::conversation_status else conversations.status end,
           resolved_at = null
         returning id`,
        [t, ch.id, contactId, m.threadId],
      );
      const { rows: [msg] } = await db.query(
        `insert into messages (tenant_id, conversation_id, direction, sender_type, body, provider_message_id, email_message_id, in_reply_to, status)
         values ($1, $2, 'inbound', 'contact', $3, $4, $5, $6, 'received')
         on conflict (conversation_id, provider_message_id) do nothing returning id`,
        [t, conv.id, m.body, m.providerMessageId, m.emailMessageId ?? null, m.inReplyTo ?? null],
      );
      if (!msg) return null;
      await markConversationBilled(db, t, conv.id, type);
      return { tenantId: t as string, messageId: msg.id as string };
    });
    if (row) stored.push(row);
  }
  for (const s of stored) await enqueue("message.received", s);
  return stored;
}

/** Contacts merge across channels on phone, then email, then Slack id. */
async function upsertContact(db: import("../db.ts").Db, tenantId: string, from: InboundMessage["from"]) {
  const email = from.email?.toLowerCase();
  const { rows: [found] } = await db.query(
    `select id, name from contacts where tenant_id = $1 and (phone = $2 or email = $3 or slack_user_id = $4)
     order by (phone = $2) desc nulls last, (email = $3) desc nulls last limit 1`,
    [tenantId, from.phone ?? null, email ?? null, from.slackUserId ?? null],
  );
  if (found) {
    await db.query(
      `update contacts set name = case when name = '' then $2 else name end,
         phone = coalesce(phone, $3), email = coalesce(email, $4), slack_user_id = coalesce(slack_user_id, $5) where id = $1 and tenant_id = $6`,
      [found.id, from.name ?? "", from.phone ?? null, email ?? null, from.slackUserId ?? null, tenantId],
    );
    return found.id as string;
  }
  const { rows: [c] } = await db.query(
    `insert into contacts (tenant_id, name, phone, email, slack_user_id) values ($1, $2, $3, $4, $5) returning id`,
    [tenantId, from.name ?? "", from.phone ?? null, email ?? null, from.slackUserId ?? null],
  );
  return c.id as string;
}

const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 } as const;

/** Applies delivery statuses; never downgrades (a late "delivered" after "read" is ignored). */
export async function applyStatuses(provider: string, type: Channel, statuses: StatusUpdate[]) {
  for (const s of statuses) {
    await asService(async (db) => { // scope: webhook-lookup (message matched through the channel's external_id)
      const fresh = await db.query(`insert into webhook_events (provider, event_id) values ($1, $2) on conflict do nothing`, [provider, `status:${s.providerMessageId}:${s.status}`]);
      if (!fresh.rowCount) return;
      await db.query(
        `update messages m set status = $3, error = $4
           from conversations c join channels ch on ch.id = c.channel_id
          where m.conversation_id = c.id and ch.type = $1 and ch.external_id = $2
            and m.provider_message_id = $5 and m.direction = 'outbound'
            and (case m.status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end) < $6`,
        [type, s.channelExternalId, s.status, s.error ?? null, s.providerMessageId, RANK[s.status]],
      );
    });
  }
}
