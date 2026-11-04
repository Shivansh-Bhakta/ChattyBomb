import { decrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env } from "../env.ts";
import { record } from "../metering.ts";
import { adapterFor } from "./index.ts";
import type { OutboundMessage } from "./types.ts";

export class WindowClosedError extends Error {
  constructor() { super("24-hour window closed: only approved template messages can be sent"); }
}

type Sender = { type: "agent"; userId: string } | { type: "ai" } | { type: "system" };

/** shortcut: country from +91 prefix only (all pilots are Indian), map more prefixes when expanding. */
const countryOf = (phone: string | null) => (phone?.startsWith("+91") ? "IN" : "OTHER");

/**
 * Sends one message on the conversation's channel, enforcing the WhatsApp 24h rule,
 * storing it, and metering it. tenantId is always checked against the conversation.
 */
export async function sendMessage(tenantId: string, conversationId: string, msg: OutboundMessage, sender: Sender) {
  const ctx = await asService(async (db) => {
    const { rows: [c] } = await db.query(
      `select c.id, c.last_inbound_at, c.external_thread_id, ch.type, ch.external_id, ch.config, ch.credentials_encrypted, ch.status as channel_status,
              ct.phone, ct.email
         from conversations c join channels ch on ch.id = c.channel_id join contacts ct on ct.id = c.contact_id
        where c.id = $1 and c.tenant_id = $2`,
      [conversationId, tenantId],
    );
    if (!c) throw new Error("conversation not found");
    if (c.channel_status !== "connected") throw new Error(`${c.type} channel is not connected`);
    const adapter = adapterFor(c.type);
    if (msg.kind === "text" && !adapter.canSendFreeform(c)) throw new WindowClosedError();
    const body = msg.kind === "text" ? msg.text : `[template ${msg.name}] ${(msg.params ?? []).join(" | ")}`;
    const { rows: [m] } = await db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status, is_template, template_name)
       values ($1, $2, 'outbound', $3, $4, $5, 'queued', $6, $7) returning id`,
      [tenantId, conversationId, sender.type, sender.type === "agent" ? sender.userId : null, body, msg.kind === "template", msg.kind === "template" ? msg.name : null],
    );
    return { c, adapter, messageId: m.id as string };
  });

  const { c, adapter, messageId } = ctx;
  try {
    const { providerMessageId } = await adapter.send(
      { channelExternalId: c.external_id, credentials: env().MOCK_MODE || !c.credentials_encrypted ? null : decrypt(c.credentials_encrypted),
        to: (c.type === "email" ? c.email : c.type === "whatsapp" ? c.phone : null) ?? c.external_thread_id, threadId: c.external_thread_id, config: c.config },
      msg,
    );
    await asService(async (db) => {
      await db.query(`update messages set status = 'sent', provider_message_id = $2 where id = $1`, [messageId, providerMessageId]);
      await db.query(`update conversations set last_message_at = now() where id = $1`, [conversationId]);
      if (c.type === "whatsapp") {
        const template = msg.kind === "template";
        await record(db, {
          tenantId, conversationId, channel: "whatsapp", quantity: 1,
          eventType: template ? "wa_template_message" : "wa_service_message",
          rateKey: `meta:${template ? msg.category : "service"}:${countryOf(c.phone)}`,
          meta: { message_id: messageId },
        });
      }
    });
    return { messageId, providerMessageId };
  } catch (e) {
    await asService((db) => db.query(`update messages set status = 'failed', error = $2 where id = $1`, [messageId, (e as Error).message.slice(0, 500)]));
    throw e;
  }
}
