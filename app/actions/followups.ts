"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { createReminder as create } from "@/lib/reminders";

export async function setLeadStatus(form: FormData) {
  const me = await requireMember();
  const id = z.guid().parse(form.get("leadId"));
  const status = z.enum(["new", "contacted", "won", "lost"]).parse(form.get("status"));
  await asUser(me.id, (db) => db.query("update leads set status = $2 where id = $1", [id, status]));
  revalidatePath("/leads");
}

export async function createReminder(form: FormData) {
  const me = await requireMember();
  const input = Object.fromEntries(form) as Record<string, string>;
  let ok = true;
  try {
    await asUser(me.id, (db) => create(db, me.id, input));
  } catch (e) {
    console.error("[createReminder]", (e as Error).message);
    ok = false;
  }
  revalidatePath("/reminders");
  redirect(`/inbox?c=${encodeURIComponent(input.conversationId ?? "")}&${ok ? "reminder=1" : "error=reminder"}`);
}

export async function cancelReminder(form: FormData) {
  const me = await requireMember();
  const id = z.guid().parse(form.get("reminderId"));
  await asUser(me.id, (db) => db.query("update reminders set status = 'cancelled' where id = $1 and status = 'scheduled'", [id]));
  revalidatePath("/reminders");
}
