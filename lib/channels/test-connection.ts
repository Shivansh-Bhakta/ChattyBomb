import { decrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env } from "../env.ts";
import { imapCreds } from "./email.ts";
import { testImap } from "./email-connect.ts";
import { testWhatsApp } from "./whatsapp-connect.ts";

async function testSlack(token: string) {
  if (env().MOCK_MODE) return;
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!j.ok) throw new Error(`Slack test failed: ${j.error ?? res.status}`);
}

/**
 * "Test connection" for a stored channel: re-checks its credentials with the provider and records
 * connected/error. The caller must already have checked the channel belongs to its tenant.
 */
export async function testChannel(tenantId: string, channelId: string, actor: { id: string; type: "user" | "platform_admin" }) {
  const { rows: [ch] } = await asService((db) => db.query( // scope: tenant
    `select id, type, provider, external_id, credentials_encrypted from channels where id = $1 and tenant_id = $2`, [channelId, tenantId]));
  if (!ch) throw new Error("channel not found");
  let error: string | null = null;
  try {
    const secretValue = ch.credentials_encrypted ? decrypt(ch.credentials_encrypted) : null;
    if (!env().MOCK_MODE && !secretValue) throw new Error("no stored credentials");
    if (ch.type === "whatsapp") await testWhatsApp(ch.external_id, secretValue ?? "");
    else if (ch.type === "slack") await testSlack(secretValue ?? "");
    else if (ch.provider === "imap") await testImap(imapCreds.parse(JSON.parse(secretValue ?? "{}")));
    // Gmail is checked by the next poll (it refreshes the OAuth token).
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }
  await asService(async (db) => { // scope: tenant
    await db.query(`update channels set status = $3, last_error = $4 where id = $1 and tenant_id = $2`, [channelId, tenantId, error ? "error" : "connected", error]);
    await db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, $3, 'channel.test', 'channel', $4, $5)`,
      [tenantId, actor.type, actor.id, channelId, { ok: !error }]);
  });
  return { ok: !error, error };
}

/**
 * Sends stuck in 'sending' (outcome unknown) for 15+ minutes: hand the conversation to a human once,
 * so a customer is never left silently without a reply.
 */
export async function sweepUnknownSends() {
  const { rows } = await asService((db) => db.query( // scope: platform-job (each update is tenant-scoped)
    `select m.id, m.tenant_id, m.conversation_id from messages m join conversations c on c.id = m.conversation_id
      where m.direction = 'outbound' and m.status = 'sending' and m.created_at < now() - interval '15 minutes'
        and c.status <> 'needs_human'
        and not exists (select 1 from audit_log a where a.action = 'send.unknown_swept' and a.target_id = m.id)
      limit 200`));
  for (const r of rows) {
    await asService(async (db) => { // scope: tenant
      await db.query(`update conversations set status = 'needs_human', summary = coalesce(summary, '') || $3 where id = $1 and tenant_id = $2`,
        [r.conversation_id, r.tenant_id, " A reply may not have reached the customer (send outcome unknown); please check and follow up."]);
      await db.query(`insert into audit_log (tenant_id, actor_type, action, target_type, target_id) values ($1, 'system', 'send.unknown_swept', 'message', $2)`, [r.tenant_id, r.id]);
    });
  }
  return rows.length;
}
