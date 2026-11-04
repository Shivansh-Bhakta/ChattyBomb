import { decrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env } from "../env.ts";
import { record } from "../metering.ts";
import { adapterFor } from "./index.ts";
import { ProviderRejectedError, type OutboundMessage } from "./types.ts";

export class WindowClosedError extends Error {
  constructor() { super("24-hour window closed: only approved template messages can be sent"); }
}

type Sender = { type: "agent"; userId: string } | { type: "ai" } | { type: "system" };

/** shortcut: country from +91 prefix only (all pilots are Indian), map more prefixes when expanding. */
const countryOf = (phone: string | null) => (phone?.startsWith("+91") ? "IN" : "OTHER");


export type SendResult = { messageId: string; providerMessageId: string | null; duplicate?: true };

/**
 * Sends one message on the conversation's channel, enforcing the WhatsApp 24h rule,
 * storing it, and metering it. tenantId is always checked against the conversation.
 *
 * Exactly-once on retries: the row is recorded as 'sending' before the provider call. With an
 * idempotencyKey, a retry finds that row and only re-sends when it is 'queued' or 'failed' (a definite
 * provider rejection); 'sent' and 'sending' (may have been delivered) are never re-sent.
 */
export async function sendMessage(tenantId: string, conversationId: string, msg: OutboundMessage, sender: Sender, opts: { idempotencyKey?: string } = {}): Promise<SendResult> {
  const ctx = await asService(async (db) => { // scope: tenant
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
    const key = opts.idempotencyKey ?? null;
    const { rows: [fresh] } = await db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status, is_template, template_name, idempotency_key)
       values ($1, $2, 'outbound', $3, $4, $5, 'sending', $6, $7, $8)
       on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing returning id`,
      [tenantId, conversationId, sender.type, sender.type === "agent" ? sender.userId : null, body, msg.kind === "template", msg.kind === "template" ? msg.name : null, key],
    );
    if (fresh) return { c, adapter, messageId: fresh.id as string, done: null };
    // Same key seen before: lock it so concurrent retries serialise, then decide from its state.
    const { rows: [prev] } = await db.query(
      `select id, status, provider_message_id from messages where tenant_id = $1 and idempotency_key = $2 and conversation_id = $3 for update`, [tenantId, key, conversationId]);
    if (!prev) throw new Error("idempotency key already used for another conversation");
    if (prev.status !== "queued" && prev.status !== "failed") {
      if (prev.status === "sending") console.error(`[outbound] not re-sending message ${prev.id}: outcome of an earlier attempt is unknown`);
      return { c, adapter, messageId: prev.id as string, done: { messageId: prev.id as string, providerMessageId: prev.provider_message_id as string | null, duplicate: true as const } };
    }
    // The retry may carry different content (e.g. a regenerated AI answer): record what is actually sent.
    await db.query(`update messages set status = 'sending', error = null, body = $3, is_template = $4, template_name = $5 where id = $1 and tenant_id = $2`,
      [prev.id, tenantId, body, msg.kind === "template", msg.kind === "template" ? msg.name : null]);
    return { c, adapter, messageId: prev.id as string, done: null };
  });
  if (ctx.done) return ctx.done;

  const { c, adapter, messageId } = ctx;
  let providerMessageId: string;
  try {
    // Decrypting happens before any network call, so its failure is a definite non-send.
    let credentials: string | null;
    try {
      credentials = env().MOCK_MODE || !c.credentials_encrypted ? null : decrypt(c.credentials_encrypted);
    } catch (e) {
      throw new ProviderRejectedError(`cannot decrypt channel credentials: ${(e as Error).message}`);
    }
    ({ providerMessageId } = await adapter.send(
      { channelExternalId: c.external_id, credentials,
        to: (c.type === "email" ? c.email : c.type === "whatsapp" ? c.phone : null) ?? c.external_thread_id, threadId: c.external_thread_id, config: c.config },
      msg,
    ));
  } catch (e) {
    // Only a definite rejection may be retried. Anything else (5xx, timeout, socket reset) may have been
    // delivered, so the row stays 'sending' and is never re-sent automatically.
    const definite = e instanceof ProviderRejectedError;
    await asService((db) => db.query(`update messages set status = $4, error = $2 where id = $1 and tenant_id = $3`, // scope: tenant
      [messageId, (definite ? "" : "outcome unknown: ") + (e as Error).message.slice(0, 480), tenantId, definite ? "failed" : "sending"]));
    throw e;
  }
  try {
    await asService(async (db) => { // scope: tenant
      await db.query(`update messages set status = 'sent', provider_message_id = $2 where id = $1 and tenant_id = $3`, [messageId, providerMessageId, tenantId]);
      await db.query(`update conversations set last_message_at = now() where id = $1 and tenant_id = $2`, [conversationId, tenantId]);
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
  } catch (e) {
    // Delivered but not recorded: the row stays 'sending' so no retry re-sends it. Needs reconciliation (and metering).
    console.error(`[outbound] message ${messageId} was delivered (${providerMessageId}) but recording it failed: ${(e as Error).message}`);
    throw e;
  }
  return { messageId, providerMessageId };
}
