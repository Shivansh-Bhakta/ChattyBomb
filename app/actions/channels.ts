"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

/** Owner picks the Slack channel (id like C0123ABCD) the bot answers in, besides DMs. RLS limits writes to owners. */
export async function setSlackChannel(form: FormData) {
  const me = await requireMember();
  const channelId = z.guid().parse(form.get("channelId"));
  const slackChannel = z.string().trim().regex(/^[CG][A-Z0-9]{6,20}$/, "Slack channel id like C0123ABCD").parse(form.get("slackChannel"));
  await asUser(me.id, async (db) => {
    const { rowCount } = await db.query(`update channels set config = config || jsonb_build_object('channel_id', $2::text) where id = $1 and type = 'slack'`, [channelId, slackChannel]);
    if (!rowCount) throw new Error("channel not found or not allowed");
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values ($1, 'user', $2, 'channel.configure', 'channel', $3, $4)`,
      [me.tenantId, me.id, channelId, { channel_id: slackChannel }],
    );
  });
  revalidatePath("/settings/channels");
}

const imapForm = z.object({
  address: z.string().trim().toLowerCase().email(),
  user: z.string().trim().min(1).max(320),
  pass: z.string().min(1).max(200),
  imapHost: z.string().trim().min(1).max(253),
  imapPort: z.coerce.number().int().min(1).max(65535),
  smtpHost: z.string().trim().min(1).max(253),
  smtpPort: z.coerce.number().int().min(1).max(65535),
});

/** IMAP/SMTP fallback with an app password. Tests the login before saving; the password is stored encrypted. */
export async function connectImap(form: FormData) {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("only owners can connect channels");
  const f = imapForm.safeParse(Object.fromEntries(form));
  if (!f.success) redirect("/settings/channels?error=imap_invalid");
  const { imapCreds } = await import("@/lib/channels/email");
  const { saveEmailChannel, testImap } = await import("@/lib/channels/email-connect");
  const creds = imapCreds.parse({
    user: f.data.user, pass: f.data.pass,
    imap: { host: f.data.imapHost, port: f.data.imapPort, secure: f.data.imapPort === 993 },
    smtp: { host: f.data.smtpHost, port: f.data.smtpPort, secure: f.data.smtpPort === 465 },
  });
  let error = "";
  try {
    await testImap(creds);
    await saveEmailChannel(me.tenantId, me.id, "imap", f.data.address, creds);
  } catch (e) {
    console.error("[connectImap]", (e as Error).message);
    error = "imap_failed";
  }
  revalidatePath("/settings/channels");
  redirect(error ? `/settings/channels?error=${error}` : "/settings/channels?connected=imap");
}

/** "Check email now": polls one email channel of the caller's tenant. */
export async function checkEmailNow(form: FormData) {
  const me = await requireMember();
  const channelId = z.guid().parse(form.get("channelId"));
  const visible = await asUser(me.id, async (db) => (await db.query(`select 1 from channels where id = $1 and type = 'email'`, [channelId])).rowCount);
  if (!visible) throw new Error("channel not found");
  await import("@/lib/ai/pipeline");
  const { pollEmail } = await import("@/lib/channels/email-poll");
  await pollEmail(channelId).catch((e) => console.error("[checkEmailNow]", (e as Error).message));
  revalidatePath("/settings/channels");
  revalidatePath("/inbox");
}

/** Owner lists the WhatsApp templates already approved in Meta (one "name,language,category" per line). */
export async function setTemplates(form: FormData) {
  const me = await requireMember();
  const channelId = z.guid().parse(form.get("channelId"));
  const { parseTemplateLines } = await import("@/lib/channels/templates");
  let templates;
  try {
    templates = parseTemplateLines(z.string().max(20_000).parse(form.get("templates") ?? ""));
  } catch {
    redirect("/settings/channels?error=templates_invalid");
  }
  await asUser(me.id, async (db) => {
    const { rowCount } = await db.query(`update channels set config = config || jsonb_build_object('templates', $2::jsonb) where id = $1 and type = 'whatsapp'`, [channelId, JSON.stringify(templates)]);
    if (!rowCount) throw new Error("channel not found or not allowed");
  });
  revalidatePath("/settings/channels");
}

/** Owner connects WhatsApp manually (first pilots): Phone number ID + permanent token from Meta. Tested before saving. */
export async function connectWhatsApp(form: FormData) {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("only owners can connect channels");
  const { saveWhatsAppChannel } = await import("@/lib/channels/whatsapp-connect");
  let ok = true;
  try {
    await saveWhatsAppChannel(me.tenantId, { id: me.id, type: "user" }, Object.fromEntries(form) as never);
  } catch (e) {
    console.error("[connectWhatsApp]", (e as Error).message);
    ok = false;
  }
  revalidatePath("/settings/channels");
  redirect(ok ? "/settings/channels?connected=whatsapp" : "/settings/channels?error=whatsapp_failed");
}
