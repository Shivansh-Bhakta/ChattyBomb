import { z } from "zod";
import { encrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env } from "../env.ts";

/** Manual WhatsApp Cloud API setup (first pilots): values copied from Meta's App Dashboard → WhatsApp → API Setup. */
export const waConnectSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "numeric Phone number ID"),
  displayPhone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "phone in +91… format"),
  accessToken: z.string().trim().min(20).max(1000),
  wabaId: z.string().trim().regex(/^\d{5,30}$/).optional().or(z.literal("").transform(() => undefined)),
});

/** "Test connection": reads the phone number from the Graph API with the token. MOCK_MODE always succeeds. */
export async function testWhatsApp(phoneNumberId: string, accessToken: string) {
  if (env().MOCK_MODE) return;
  const res = await fetch(`https://graph.facebook.com/${env().WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number`, {
    headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`WhatsApp test failed (${res.status})`);
}

/** Stores the channel with the token encrypted. A number connected to another tenant is refused. */
export async function saveWhatsAppChannel(tenantId: string, actor: { id: string; type: "user" | "platform_admin" }, input: z.input<typeof waConnectSchema>) {
  const w = waConnectSchema.parse(input);
  await testWhatsApp(w.phoneNumberId, w.accessToken);
  return asService(async (db) => { // scope: tenant (on-conflict update guarded by tenant_id)
    const { rows: [ch] } = await db.query(
      `insert into channels (tenant_id, type, provider, status, external_id, config, credentials_encrypted, connected_by, connected_at)
       values ($1, 'whatsapp', 'meta', 'connected', $2, $3, $4, $5, now())
       on conflict (type, external_id) do update set status = 'connected', credentials_encrypted = excluded.credentials_encrypted,
         config = channels.config || excluded.config, connected_by = excluded.connected_by, connected_at = now(), last_error = null
       where channels.tenant_id = excluded.tenant_id
       returning id`,
      [tenantId, w.phoneNumberId, { display_phone: w.displayPhone, ...(w.wabaId && { waba_id: w.wabaId }) }, encrypt(w.accessToken), actor.id]);
    if (!ch) throw new Error("this WhatsApp number is connected to another business");
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, $3, 'channel.connect', 'channel', $4, $5)`,
      [tenantId, actor.type, actor.id, ch.id, { type: "whatsapp", phone_number_id: w.phoneNumberId, assisted: actor.type === "platform_admin" }]);
    return ch.id as string;
  });
}
