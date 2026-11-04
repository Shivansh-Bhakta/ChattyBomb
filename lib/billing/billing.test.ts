import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/razorpay/route";
import { asService, closePool } from "../db.ts";
import { mockMail } from "../mailer.ts";
import { markConversationBilled } from "../metering.ts";
import { generateMonthlyInvoices, invoiceLines, previousMonthIST } from "./invoices.ts";
import { expirePilots, notifyLimitReached } from "./lifecycle.ts";
import { mockRazorpay, startSubscription, verifyRazorpaySignature } from "./razorpay.ts";
import { A_OWNER, B_OWNER, CONV_A1, TENANT_A, TENANT_B } from "../../test/ids.ts";

afterAll(closePool);
beforeEach(() => { mockMail.length = 0; mockRazorpay.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const rzp = (event: string, subId: string, eventId = `evt_${Math.random()}`, secret = "test-razorpay-secret") => {
  const raw = JSON.stringify({ event, payload: { subscription: { entity: { id: subId, status: "active", current_start: 1_800_000_000, current_end: 1_802_592_000 } }, payment: { entity: { id: "pay_1", amount: 117882 } } } });
  return new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers: { "x-razorpay-signature": createHmac("sha256", secret).update(raw).digest("hex"), "x-razorpay-event-id": eventId } });
};

describe("Razorpay webhook", () => {
  it("verifies signatures", () => {
    const sig = createHmac("sha256", "s").update("{}").digest("hex");
    expect(verifyRazorpaySignature("{}", sig, "s")).toBe(true);
    expect(verifyRazorpaySignature("{} ", sig, "s")).toBe(false);
    expect(verifyRazorpaySignature("{}", sig, "other")).toBe(false);
    expect(verifyRazorpaySignature("{}", null, "s")).toBe(false);
    expect(verifyRazorpaySignature("{}", "zz", "s")).toBe(false);
  });

  it("subscribe → activated → charged → halted → cancelled, each applied once", async () => {
    await startSubscription(TENANT_B, B_OWNER, "growth");
    expect(mockRazorpay[0]).toMatchObject({ call: "/subscriptions", body: { plan_id: "plan_mock_growth", notes: { tenant_id: TENANT_B } } });
    const [sub] = await q(`select razorpay_subscription_id as rid, amount_paise::int as amount from subscriptions where tenant_id = $1`, [TENANT_B]);
    expect(sub.amount).toBe(299900);
    await expect(startSubscription(TENANT_B, B_OWNER, "starter")).rejects.toThrow(/already has a subscription/);

    expect((await POST(rzp("subscription.activated", sub.rid, "evt_1", "wrong"))).status).toBe(401);
    expect((await POST(rzp("subscription.activated", sub.rid, "evt_1"))).status).toBe(200);
    expect((await POST(rzp("subscription.activated", sub.rid, "evt_1"))).status).toBe(200); // duplicate delivery
    expect(await q(`select count(*)::int as n from audit_log where action = 'billing.subscription.activated'`)).toEqual([{ n: 1 }]);
    // Paying for Growth switches the tenant to Growth and its 2,000-conversation limit.
    expect((await q(`select status, plan, conversation_limit from tenants where id = $1`, [TENANT_B]))[0]).toEqual({ status: "active", plan: "growth", conversation_limit: 2000 });

    await POST(rzp("subscription.halted", sub.rid));
    expect((await q(`select t.status as t, s.status as s from tenants t join subscriptions s on s.tenant_id = t.id where t.id = $1`, [TENANT_B]))[0]).toEqual({ t: "suspended", s: "halted" });
    await POST(rzp("subscription.charged", sub.rid));
    expect((await q(`select status from tenants where id = $1`, [TENANT_B]))[0].status).toBe("active");
    await POST(rzp("subscription.cancelled", sub.rid));
    expect((await q(`select t.status as t, s.status as s from tenants t join subscriptions s on s.tenant_id = t.id where t.id = $1`, [TENANT_B]))[0]).toEqual({ t: "cancelled", s: "cancelled" });
  });

  it("ignores unknown subscriptions and rejects malformed payloads", async () => {
    expect((await POST(rzp("subscription.activated", "sub_unknown"))).status).toBe(200);
    const raw = "not json", sig = createHmac("sha256", "test-razorpay-secret").update(raw).digest("hex");
    expect((await POST(new Request("http://x", { method: "POST", body: raw, headers: { "x-razorpay-signature": sig } }))).status).toBe(400);
  });
});

describe("invoices", () => {
  it("computes plan, overage only when billed, Meta pass-through and 18% GST", () => {
    const base = { planName: "growth", planPaise: 299900, used: 2100, limit: 2000, overageRateInr: 2, metaFeesInr: 12.345 };
    const paused = invoiceLines({ ...base, overagePolicy: "pause_ai" });
    expect(paused).toMatchObject({ subtotal_paise: 299900, overage_paise: 0, meta_fees_paise: 1235, gst_paise: Math.round((299900 + 1235) * 0.18) });
    const billed = invoiceLines({ ...base, overagePolicy: "bill_overage" });
    expect(billed.overage_paise).toBe(20000);
    expect(billed.total_paise).toBe(299900 + 20000 + 1235 + Math.round((299900 + 20000 + 1235) * 0.18));
    expect(() => invoiceLines({ ...base, overagePolicy: "bill_overage", overageRateInr: null })).toThrow(/missing rate/);
  });

  it("previous IST month boundaries, including January", () => {
    const p = previousMonthIST(new Date("2027-01-01T00:10:00+05:30"));
    expect(p.label).toBe("2026-12");
    expect(p.start.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(p.end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("issues last month's invoice once per tenant, counting only that month's usage, and adds usage to the next renewal", async () => {
    await q(`insert into subscriptions (tenant_id, plan, razorpay_subscription_id, status, amount_paise) values ($1, 'starter', 'sub_mock_a', 'active', 99900)`, [TENANT_A]);
    await q(`update tenants set overage_policy = 'bill_overage', conversation_limit = 1 where id = $1`, [TENANT_A]);
    const now = new Date();
    const lastMonth = new Date(previousMonthIST(now).start.getTime() + 86400_000);
    await q(`insert into usage_events (tenant_id, conversation_id, channel, event_type, quantity, unit_cost_inr, total_cost_inr, created_at) values
      ($1, $2, 'whatsapp', 'conversation_billed', 1, 0, 0, $3), ($1, '40000000-0000-0000-0000-0000000000a2', 'whatsapp', 'conversation_billed', 1, 0, 0, $3),
      ($1, $2, 'whatsapp', 'wa_template_message', 1, 0.8, 0.8, $3), ($1, $2, 'whatsapp', 'wa_template_message', 1, 0.8, 0.8, now())`, [TENANT_A, CONV_A1, lastMonth]);
    const first = await generateMonthlyInvoices(now);
    expect(first).toHaveLength(1);
    expect(await generateMonthlyInvoices(now)).toEqual([]); // idempotent
    const [inv] = await q(`select subtotal_paise::int as plan, overage_paise::int as overage, meta_fees_paise::int as meta, gst_paise::int as gst, total_paise::int as total, status from invoices where tenant_id = $1`, [TENANT_A]);
    expect(inv).toEqual({ plan: 99900, overage: 200, meta: 80, gst: Math.round((99900 + 200 + 80) * 0.18), total: 99900 + 280 + Math.round((99900 + 280) * 0.18), status: "issued" });
    expect(mockRazorpay).toEqual([{ call: "/subscriptions/sub_mock_a/addons", body: expect.objectContaining({ item: expect.objectContaining({ amount: Math.round(280 * 1.18), currency: "INR" }) }) }]);
    // A charge settles it.
    await POST(rzp("subscription.charged", "sub_mock_a"));
    expect((await q(`select status from invoices where tenant_id = $1`, [TENANT_A]))[0].status).toBe("paid");
  });
});

describe("pilot and limits", () => {
  it("expires only past-due pilots without a live subscription", async () => {
    await q(`update tenants set status = 'pilot', pilot_ends_at = now() - interval '1 hour' where id = $1`, [TENANT_B]);
    await q(`update subscriptions set status = 'cancelled' where tenant_id = $1`, [TENANT_B]);
    const hooked: string[] = [];
    expect(await expirePilots(async (id) => { hooked.push(id); })).toEqual([TENANT_B]);
    expect(hooked).toEqual([TENANT_B]);
    expect((await q(`select status from tenants where id = $1`, [TENANT_B]))[0].status).toBe("suspended");
    expect(await expirePilots()).toEqual([]);
  });

  it("emails owners once a month when the limit pauses the AI", async () => {
    expect(await notifyLimitReached(TENANT_A)).toBe(1);
    expect(await notifyLimitReached(TENANT_A)).toBe(0);
    expect(mockMail).toEqual([expect.objectContaining({ to: "owner@sunrise.test", subject: expect.stringMatching(/limit reached/) })]);
    expect(A_OWNER).toBeTruthy();
    await asService((db) => markConversationBilled(db, TENANT_A, CONV_A1, "whatsapp")); // keep import used
  });
});
