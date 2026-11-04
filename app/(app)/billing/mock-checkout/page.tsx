import { createHmac } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { applyRazorpayEvent } from "@/lib/billing/razorpay";
import { asService } from "@/lib/db";
import { mockAuthAllowed } from "@/lib/env";

/** MOCK_MODE only: stands in for Razorpay's hosted checkout by applying an activation + first charge. */
export default async function MockCheckout({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!mockAuthAllowed()) notFound();
  const me = await requireMember();
  const sub = z.string().regex(/^sub_mock_[a-z0-9]+$/).safeParse((await searchParams).sub);
  if (!sub.success) notFound();
  const { rowCount } = await asService((db) => db.query(`select 1 from subscriptions where razorpay_subscription_id = $1 and tenant_id = $2`, [sub.data, me.tenantId])); // scope: tenant
  if (!rowCount) notFound();
  const now = Math.floor(Date.now() / 1000);
  for (const event of ["subscription.activated", "subscription.charged"]) {
    const raw = JSON.stringify({ event, payload: { subscription: { entity: { id: sub.data, status: "active", current_start: now, current_end: now + 30 * 86400 } }, payment: { entity: { id: `pay_mock_${now}`, amount: 0 } } } });
    await applyRazorpayEvent(raw, createHmac("sha256", "mock").update(raw).digest("hex"));
  }
  redirect("/settings?subscribed=1");
}
