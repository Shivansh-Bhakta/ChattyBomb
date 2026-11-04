"use server";
import { revalidatePath } from "next/cache";
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
