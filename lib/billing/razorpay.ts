import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { asService } from "../db.ts";
import { env, secret } from "../env.ts";

// Razorpay REST + webhook shapes are from Razorpay's Subscriptions docs as of 2026 (not verifiable offline: re-check on first live test).
const API = "https://api.razorpay.com/v1";

export function verifyRazorpaySignature(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex"), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** MOCK_MODE: Razorpay API calls are recorded here. */
export const mockRazorpay: { call: string; body: unknown }[] = [];

async function api<T>(path: string, body: unknown): Promise<T> {
  if (env().MOCK_MODE) {
    mockRazorpay.push({ call: path, body });
    return { id: `${path.includes("addons") ? "ao" : "sub"}_mock_${randomUUID().slice(0, 8)}`, status: "created", short_url: "" } as T;
  }
  const auth = Buffer.from(`${secret("RAZORPAY_KEY_ID")}:${secret("RAZORPAY_KEY_SECRET")}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${path.split("/")[1]} failed (${res.status}): ${json.error?.description ?? "unknown"}`);
  return json as T;
}

/**
 * Creates a Razorpay subscription for the tenant's chosen plan and records it as 'created'.
 * Returns the hosted checkout URL (UPI autopay or card mandate). Plan amounts in Razorpay must be
 * configured GST-inclusive; amount_paise here is our GST-exclusive list price from the rates table.
 */
export async function startSubscription(tenantId: string, userId: string, plan: "starter" | "growth") {
  const planId = env().MOCK_MODE ? `plan_mock_${plan}` : secret(plan === "starter" ? "RAZORPAY_PLAN_STARTER" : "RAZORPAY_PLAN_GROWTH");
  const { rows: [price] } = await asService((db) => db.query( // scope: tenant (reads a platform price, writes nothing)
    `select value from rates where key = $1 and effective_from <= now() order by effective_from desc limit 1`, [`plan:${plan}:monthly`]));
  if (!price) throw new Error(`no price for plan ${plan} in rates`);
  const live = await asService((db) => db.query( // scope: tenant
    `select 1 from subscriptions where tenant_id = $1 and status in ('created', 'active', 'halted')`, [tenantId]));
  if (live.rowCount) throw new Error("this business already has a subscription");
  const sub = await api<{ id: string; short_url: string }>("/subscriptions", { plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1, notes: { tenant_id: tenantId } });
  await asService(async (db) => { // scope: tenant
    await db.query(`insert into subscriptions (tenant_id, plan, razorpay_subscription_id, status, amount_paise) values ($1, $2, $3, 'created', $4)`,
      [tenantId, plan, sub.id, Math.round(Number(price.value) * 100)]);
    await db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, metadata) values ($1, 'user', $2, 'billing.subscribe', 'subscription', $3)`,
      [tenantId, userId, { plan, razorpay_subscription_id: sub.id }]);
  });
  // MOCK_MODE: a local "checkout" that fires a signed activation webhook (see app/(app)/billing/mock-checkout).
  return env().MOCK_MODE ? `/billing/mock-checkout?sub=${encodeURIComponent(sub.id)}` : sub.short_url;
}

/** Charges an amount with the next renewal (overage + Meta fees, GST-inclusive). */
export const createAddon = (subscriptionId: string, amountPaise: number, name: string) =>
  api<{ id: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/addons`, { item: { name: name.slice(0, 100), amount: amountPaise, currency: "INR" }, quantity: 1 });

const ts = z.number().int().positive().nullish().transform((v) => (v ? new Date(v * 1000) : null));
const webhook = z.object({
  event: z.string().max(100),
  payload: z.object({
    subscription: z.object({ entity: z.object({ id: z.string().min(1).max(100), status: z.string().max(50).optional(), current_start: ts, current_end: ts }) }).optional(),
    payment: z.object({ entity: z.object({ id: z.string().max(100), amount: z.number().int().nonnegative().optional() }) }).optional(),
  }),
});

/** Event id for dedupe: Razorpay's header, else a hash of the signed body (identical re-deliveries collapse). */
export const eventIdOf = (raw: string, headers: Headers) => headers.get("x-razorpay-event-id") ?? createHash("sha256").update(raw).digest("hex");

/**
 * Applies one verified webhook. Dedupe row and state change share a transaction, so a failure
 * lets Razorpay's retry through. Subscriptions are found by OUR stored id only (never by notes).
 */
export async function applyRazorpayEvent(raw: string, eventId: string) {
  const e = webhook.parse(JSON.parse(raw));
  const sub = e.payload.subscription?.entity;
  if (!sub) return { applied: false, reason: "not a subscription event" };
  return asService(async (db) => { // scope: webhook-lookup (subscription resolved by our stored razorpay id, then tenant-scoped writes)
    const fresh = await db.query(`insert into webhook_events (provider, event_id) values ('razorpay', $1) on conflict do nothing`, [eventId]);
    if (!fresh.rowCount) return { applied: false, reason: "duplicate" };
    const { rows: [s] } = await db.query(`select id, tenant_id from subscriptions where razorpay_subscription_id = $1 for update`, [sub.id]);
    if (!s) return { applied: false, reason: "unknown subscription" };
    const t = s.tenant_id as string;
    const setSub = (status: string) => db.query(
      `update subscriptions set status = $3::subscription_status, current_period_start = coalesce($4, current_period_start), current_period_end = coalesce($5, current_period_end),
         cancelled_at = case when $3::subscription_status = 'cancelled' then now() else cancelled_at end where id = $1 and tenant_id = $2`,
      [s.id, t, status, sub.current_start, sub.current_end]);
    const setTenant = (status: string) => db.query(`update tenants set status = $2 where id = $1`, [t, status]);
    switch (e.event) {
      case "subscription.authenticated":
      case "subscription.activated":
      case "subscription.resumed":
        await setSub("active"); await setTenant("active"); break;
      case "subscription.charged": {
        await setSub("active"); await setTenant("active");
        // Oldest unpaid invoice is settled by this charge (plan + any add-ons).
        await db.query(`update invoices set status = 'paid', razorpay_payment_id = $3 where id = (
          select id from invoices where tenant_id = $1 and subscription_id = $2 and status in ('issued', 'failed') order by period_start limit 1)`,
          [t, s.id, e.payload.payment?.entity.id ?? null]);
        break;
      }
      case "subscription.pending": // a renewal charge failed; Razorpay retries
        await db.query(`update invoices set status = 'failed' where tenant_id = $1 and subscription_id = $2 and status = 'issued'`, [t, s.id]);
        break;
      case "subscription.halted": // retries exhausted: pause the AI until paid
        await setSub("halted"); await setTenant("suspended"); break;
      case "subscription.cancelled":
      case "subscription.completed":
        await setSub(e.event === "subscription.cancelled" ? "cancelled" : "completed"); await setTenant("cancelled"); break;
      default:
        return { applied: false, reason: `ignored ${e.event}` };
    }
    await db.query(`insert into audit_log (tenant_id, actor_type, action, target_type, target_id, metadata) values ($1, 'system', $2, 'subscription', $3, $4)`,
      [t, `billing.${e.event}`, s.id, { event_id: eventId }]);
    return { applied: true, reason: e.event };
  });
}
