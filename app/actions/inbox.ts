"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { asUser, type Db } from "@/lib/db";
import { STATUSES } from "@/lib/inbox";

const id = z.guid();

async function audit(db: Db, tenantId: string, userId: string, action: string, targetId: string, metadata = {}) {
  await db.query(
    `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata)
     values ($1, 'user', $2, $3, 'conversation', $4, $5)`,
    [tenantId, userId, action, targetId, metadata],
  );
}

/** Updates one conversation field under RLS and audit-logs it. Throws if not visible to the caller. */
async function update(form: FormData, field: "status" | "assignee_id" | "ai_paused", value: unknown, action: string) {
  const me = await requireMember();
  const conversationId = id.parse(form.get("conversationId"));
  await asUser(me.id, async (db) => {
    const extra = field === "status" ? `, resolved_at = case when $1::conversation_status = 'resolved' then now() else null end` : "";
    const { rowCount } = await db.query(`update conversations set ${field} = $1${extra} where id = $2`, [value, conversationId]);
    if (!rowCount) throw new Error("conversation not found");
    await audit(db, me.tenantId, me.id, action, conversationId, { [field]: value });
  });
  revalidatePath("/inbox");
}

export async function setStatus(form: FormData) {
  await update(form, "status", z.enum(STATUSES).parse(form.get("status")), "conversation.status");
}

export async function assign(form: FormData) {
  const raw = form.get("assigneeId");
  const assigneeId = raw ? id.parse(raw) : null;
  // The FK alone would accept a user from another tenant; check membership under RLS.
  if (assigneeId) {
    const me = await requireMember();
    const ok = await asUser(me.id, async (db) => (await db.query("select 1 from users where id = $1 and tenant_id = $2", [assigneeId, me.tenantId])).rowCount);
    if (!ok) throw new Error("assignee not in your team");
  }
  await update(form, "assignee_id", assigneeId, "conversation.assign");
}

/** "Take over from AI": pausing the bot is a human override and is audit-logged. */
export async function setAiPaused(form: FormData) {
  await update(form, "ai_paused", z.enum(["true", "false"]).parse(form.get("paused")) === "true", "human.override");
}

export async function addNote(form: FormData) {
  const me = await requireMember();
  const conversationId = id.parse(form.get("conversationId"));
  const body = z.string().trim().min(1).max(5000).parse(form.get("body"));
  await asUser(me.id, async (db) => {
    const { rowCount } = await db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status)
       select tenant_id, id, 'note', 'agent', $2, $3, 'received' from conversations where id = $1`,
      [conversationId, me.id, body],
    );
    if (!rowCount) throw new Error("conversation not found");
  });
  revalidatePath("/inbox");
}

/** Agent reply on the conversation's channel. Outside the WhatsApp 24h window only templates may be sent (M8). */
export async function sendReply(form: FormData) {
  const me = await requireMember();
  const conversationId = id.parse(form.get("conversationId"));
  const text = z.string().trim().min(1).max(4096).parse(form.get("body"));
  const { sendMessage, WindowClosedError } = await import("@/lib/channels/outbound");
  let error = "";
  try {
    const { messageId } = await sendMessage(me.tenantId, conversationId, { kind: "text", text }, { type: "agent", userId: me.id });
    await asUser(me.id, (db) => audit(db, me.tenantId, me.id, "human.reply", conversationId, { message_id: messageId }));
  } catch (e) {
    error = e instanceof WindowClosedError ? "window" : "send";
    console.error("[sendReply]", (e as Error).message);
  }
  revalidatePath("/inbox");
  if (error) redirect(`/inbox?c=${conversationId}&error=${error}`);
}

/** Approved WhatsApp template (the only option outside the 24h window). Must be in the channel's template list. */
export async function sendTemplate(form: FormData) {
  const me = await requireMember();
  const conversationId = id.parse(form.get("conversationId"));
  const name = z.string().trim().min(1).max(512).parse(form.get("template"));
  const params = z.string().max(1000).parse(form.get("params") ?? "").split("|").map((p) => p.trim()).filter(Boolean).slice(0, 10);
  const { templatesOf } = await import("@/lib/channels/templates");
  const { sendMessage } = await import("@/lib/channels/outbound");
  const config = await asUser(me.id, async (db) => (await db.query(
    `select ch.config from conversations c join channels ch on ch.id = c.channel_id where c.id = $1`, [conversationId])).rows[0]?.config);
  const t = templatesOf(config).find((x) => x.name === name);
  let error = "";
  try {
    if (!t) throw new Error("template not approved for this channel");
    const { messageId } = await sendMessage(me.tenantId, conversationId, { kind: "template", ...t, params }, { type: "agent", userId: me.id });
    await asUser(me.id, (db) => audit(db, me.tenantId, me.id, "human.template", conversationId, { message_id: messageId, template: name }));
  } catch (e) {
    console.error("[sendTemplate]", (e as Error).message);
    error = "send";
  }
  revalidatePath("/inbox");
  if (error) redirect(`/inbox?c=${conversationId}&error=${error}`);
}
