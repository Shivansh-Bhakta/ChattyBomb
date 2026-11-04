import { sendMessage } from "../channels/outbound.ts";
import { asService, type Db } from "../db.ts";
import { env } from "../env.ts";
import { conversationsThisMonth, recordAnthropicUsage, type Channel } from "../metering.ts";
import { onEvent } from "../queue.ts";
import { answer } from "./answer.ts";
import { classify } from "./classify.ts";
import type { Usage } from "./claude.ts";
import { afterAnswer, beforeAnswer } from "./handoff.ts";
import { notifyLimitReached } from "../billing/lifecycle.ts";
import { retrieve } from "./retrieve.ts";

export type Outcome = "skipped" | "replied" | "handoff";

/**
 * AI step for one inbound message: classify → retrieve → answer or hand off.
 * Safe to retry: skips when a reply after this message already exists.
 */
export async function processInbound({ tenantId, messageId }: { tenantId: string; messageId: string }): Promise<{ outcome: Outcome; reason?: string }> {
  const ctx = await asService(async (db) => { // scope: tenant
    const { rows: [m] } = await db.query(
      `select m.id, m.body, m.created_at, m.conversation_id, c.status, c.ai_paused, ch.type as channel,
              t.status as tenant_status, t.conversation_limit, t.overage_policy,
              (select o.status from messages o where o.tenant_id = m.tenant_id and o.idempotency_key = 'ai-reply:' || m.id::text) as ai_reply_status,
              (select count(*)::int from messages o join conversations oc on oc.id = o.conversation_id
                where oc.tenant_id = m.tenant_id and oc.contact_id = c.contact_id and oc.channel_id = c.channel_id
                  and o.direction = 'outbound' and o.sender_type = 'ai' and o.status <> 'failed'
                  and o.created_at > now() - interval '1 day') as ai_replies_24h,
              exists (select 1 from messages o where o.conversation_id = m.conversation_id and o.direction = 'outbound' and o.status <> 'failed' and o.created_at >= m.created_at and o.idempotency_key is distinct from 'ai-reply:' || m.id::text) as already_replied
         from messages m join conversations c on c.id = m.conversation_id join channels ch on ch.id = c.channel_id join tenants t on t.id = m.tenant_id
        where m.id = $1 and m.tenant_id = $2 and m.direction = 'inbound'`,
      [messageId, tenantId],
    );
    if (!m) return null;
    const over = m.overage_policy === "pause_ai" && (await conversationsThisMonth(db, tenantId)) > m.conversation_limit;
    const skip = m.ai_paused ? "ai_paused" : m.status === "needs_human" ? "already_with_human" : m.already_replied ? "already_replied"
      : !["pilot", "active"].includes(m.tenant_status) ? "tenant_inactive" : over ? "over_limit" : null;
    const { rows: history } = await db.query(
      `select direction, sender_type, body from messages where conversation_id = $1 and tenant_id = $3 and direction <> 'note' and created_at <= (select created_at from messages where id = $2)
        order by created_at desc limit 10`,
      [m.conversation_id, m.id, tenantId],
    );
    return { m, skip, transcript: history.reverse().map((h) => `${h.direction === "inbound" ? "Customer" : "Business"}: ${h.body}`).join("\n") };
  });
  if (!ctx) return { outcome: "skipped", reason: "not_found" };
  if (ctx.skip === "over_limit") await notifyLimitReached(tenantId);
  if (ctx.skip) return { outcome: "skipped", reason: ctx.skip };
  const { m, transcript } = ctx;
  const base = { tenantId, conversationId: m.conversation_id as string, channel: m.channel as Channel };
  // Retry after our own reply attempt: never re-run (and re-bill) the AI. Only a definitely failed send is retried.
  if (m.ai_reply_status === "sending") return handoff(base, m.id, "send_outcome_unknown", "An AI reply may or may not have reached the customer (send outcome unknown). Please check and follow up.");
  if (m.ai_reply_status && m.ai_reply_status !== "failed") return { outcome: "skipped", reason: "already_sent" };
  // Email loop guard: a sender (e.g. an auto-responder we couldn't detect) gets at most N AI replies a day.
  if (m.channel === "email" && m.ai_replies_24h >= env().AI_EMAIL_DAILY_REPLY_CAP) {
    return handoff(base, m.id, "email_daily_cap", `AI reply limit (${env().AI_EMAIL_DAILY_REPLY_CAP}/day) reached for this sender; possible auto-reply loop. Last message: "${String(m.body).slice(0, 200)}"`);
  }
  const meter = (db: Db, u: Usage) => (u ? recordAnthropicUsage(db, base, u.model, u.usage) : Promise.resolve());

  const c = await classify(transcript);
  const chunks = await asService(async (db) => { // scope: tenant
    await meter(db, c.usage);
    await db.query(`update messages set intent = $2 where id = $1 and tenant_id = $3`, [m.id, c.result.intent, tenantId]);
    if (c.result.intent === "sales_lead" || c.result.intent === "booking") {
      await db.query(
        `insert into leads (tenant_id, contact_id, conversation_id, name, phone, email, intent, source_channel)
         select c.tenant_id, c.contact_id, c.id, ct.name, ct.phone, ct.email, $2, $3
           from conversations c join contacts ct on ct.id = c.contact_id where c.id = $1 and c.tenant_id = $4
         on conflict (conversation_id) where conversation_id is not null do nothing`,
        [m.conversation_id, c.result.intent, m.channel, tenantId],
      );
    }
    const needsDocs = c.result.intent !== "refund_complaint" && !c.result.sensitive;
    return needsDocs ? retrieve(db, tenantId, m.body, 5, m.conversation_id) : [];
  });

  const pre = beforeAnswer(c.result, chunks[0]?.score ?? null, env().AI_MIN_RETRIEVAL_SCORE);
  if (pre.handoff) return handoff(base, m.id, pre.reason, c.result.summary);

  const a = await answer(m.body, transcript, c.result.language, chunks);
  await asService(async (db) => { // scope: tenant
    await meter(db, a.usage);
    await db.query(`update messages set ai_confidence = $2 where id = $1 and tenant_id = $3`, [m.id, a.result.confidence, tenantId]);
  });
  const post = afterAnswer(a.result, env().AI_MIN_CONFIDENCE);
  if (post.handoff) return handoff(base, m.id, post.reason, c.result.summary);

  let sent;
  try {
    sent = await sendMessage(tenantId, base.conversationId, { kind: "text", text: a.result.answer }, { type: "ai" }, { idempotencyKey: `ai-reply:${m.id}` });
  } catch (e) {
    // Never retried automatically (a retry could double-send); a human takes it from here.
    console.error(`[pipeline] AI reply for message ${m.id} failed: ${(e as Error).message}`);
    return handoff(base, m.id, "send_failed", `The AI reply could not be confirmed as sent (${(e as Error).message.slice(0, 120)}). Please reply manually.`);
  }
  if (sent.duplicate) {
    if (!sent.providerMessageId) return handoff(base, m.id, "send_outcome_unknown", "An AI reply may or may not have reached the customer (send outcome unknown). Please check and follow up.");
    return { outcome: "skipped", reason: "already_sent" };
  }
  await asService((db) => db.query( // scope: tenant
    `insert into audit_log (tenant_id, actor_type, action, target_type, target_id, metadata) values ($1, 'ai', 'ai.reply', 'message', $2, $3)`,
    [tenantId, sent.messageId, { inbound_message_id: m.id, intent: c.result.intent, confidence: a.result.confidence, top_score: chunks[0]?.score }],
  ));
  return { outcome: "replied" };
}

async function handoff(base: { tenantId: string; conversationId: string }, messageId: string, reason: string, summary: string): Promise<{ outcome: Outcome; reason: string }> {
  await asService(async (db) => { // scope: tenant
    await db.query(`update conversations set status = 'needs_human', summary = $3 where id = $1 and tenant_id = $2`, [base.conversationId, base.tenantId, summary.slice(0, 1000)]);
    await db.query(
      `insert into audit_log (tenant_id, actor_type, action, target_type, target_id, metadata) values ($1, 'ai', 'ai.handoff', 'conversation', $2, $3)`,
      [base.tenantId, base.conversationId, { reason, message_id: messageId }],
    );
  });
  return { outcome: "handoff", reason };
}

onEvent("message.received", processInbound);
