"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { startSubscription } from "@/lib/billing/razorpay";
import { asUser } from "@/lib/db";

export async function subscribe(form: FormData) {
  const me = await requireMember();
  if (me.role !== "owner") redirect("/settings?error=owner_only");
  const plan = z.enum(["starter", "growth"]).parse(form.get("plan"));
  let url = "";
  try {
    url = await startSubscription(me.tenantId, me.id, plan);
  } catch (e) {
    console.error("[subscribe]", (e as Error).message);
    redirect("/settings?error=subscribe");
  }
  redirect(url);
}

const gstin = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "15-character GSTIN");

/** Billing details printed on invoices. Owners only (column grants + RLS). */
export async function saveBillingDetails(form: FormData) {
  const me = await requireMember();
  const v = z.object({
    billing_name: z.string().trim().min(2).max(200),
    billing_address: z.string().trim().min(5).max(500),
    gstin: z.union([z.literal(""), gstin]).transform((x) => x || null),
  }).safeParse(Object.fromEntries(form));
  if (!v.success) redirect("/settings?error=billing");
  await asUser(me.id, (db) => db.query(`update tenants set billing_name = $2, billing_address = $3, gstin = $4 where id = $1`, [me.tenantId, v.data.billing_name, v.data.billing_address, v.data.gstin]));
  revalidatePath("/settings");
}
