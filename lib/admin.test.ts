import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addRate, changePlan, currentRates, dailyTrend, grantPilotDays, overview, setOverage, setSuspended, tenantDetail, tenantMetrics, toCsv, topConversations } from "./admin.ts";
import { checkSpendAlerts, mockAlerts, setAlertSettings } from "./alerts.ts";
import { saveWhatsAppChannel } from "./channels/whatsapp-connect.ts";
import { decrypt } from "./crypto.ts";
import { asService, closePool } from "./db.ts";
import { A_OWNER, ADMIN, CONV_A1, CONV_B1, TENANT_A, TENANT_B } from "../test/ids.ts";

afterAll(closePool);
beforeEach(() => { mockAlerts.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const usage = (tenant: string, conv: string | null, type: string, cost: number, channel = "whatsapp") =>
  q(`insert into usage_events (tenant_id, conversation_id, channel, event_type, quantity, unit_cost_inr, total_cost_inr) values ($1, $2, $3, $4, 1, $5, $5)`, [tenant, conv, channel, type, cost]);

describe("admin access", () => {
  it("every console query and control refuses non-admins", async () => {
    await expect(tenantMetrics(A_OWNER)).rejects.toThrow(/platform admin only/);
    await expect(dailyTrend(A_OWNER)).rejects.toThrow(/platform admin only/);
    await expect(topConversations(A_OWNER, null)).rejects.toThrow(/platform admin only/);
    await expect(setSuspended(A_OWNER, TENANT_B, true)).rejects.toThrow(/platform admin only/);
    await expect(addRate(A_OWNER, { key: "x:y:z", value: 1, currency: "INR", unit: "per_message" })).rejects.toThrow(/platform admin only/);
    // A user of tenant A cannot connect a channel into tenant B (enforce_tenant_refs).
    await expect(saveWhatsAppChannel(TENANT_B, { id: A_OWNER, type: "user" }, { phoneNumberId: "1234567", displayPhone: "+919800000099", accessToken: "x".repeat(30) })).rejects.toThrow(/another tenant/);
  });
});

describe("tenant economics", () => {
  it("computes revenue, cost, margin and flags", async () => {
    await q(`insert into subscriptions (tenant_id, plan, status, amount_paise) values ($1, 'growth', 'active', 299900)`, [TENANT_A]);
    await usage(TENANT_A, CONV_A1, "ai_output_tokens", 100);
    await usage(TENANT_A, CONV_A1, "wa_template_message", 20);
    await usage(TENANT_B, CONV_B1, "ai_input_tokens", 30);
    await q(`update tenants set conversation_limit = 1 where id = $1`, [TENANT_B]);
    await usage(TENANT_B, CONV_B1, "conversation_billed", 0);

    const rows = await tenantMetrics(ADMIN);
    const a = rows.find((r) => r.id === TENANT_A)!, b = rows.find((r) => r.id === TENANT_B)!;
    expect(a).toMatchObject({ plan_revenue: 2999, ai_cost: 100, meta_fees: 20, revenue: 3019, cost: 120, margin: 2899, negative_margin: false });
    expect(b).toMatchObject({ revenue: 0, cost: 30, margin: -30, margin_pct: null, negative_margin: true, near_limit: true });
    const o = overview(rows);
    expect(o).toMatchObject({ aiCost: 130, metaFees: 20, revenue: 3019, margin: 2869 });
    expect(o).toMatchObject({ mrr: 2999, activeTenants: 1, pilots: 1 });
  });

  it("drill-downs: top conversations, per-tenant breakdown, daily trend", async () => {
    const top = await topConversations(ADMIN, null, 20);
    expect(top[0]).toMatchObject({ id: CONV_A1, cost: 120 });
    const d = await tenantDetail(ADMIN, TENANT_A);
    expect(d!.breakdown.map((x) => x.event_type)).toEqual(expect.arrayContaining(["ai_output_tokens", "wa_template_message"]));
    const trend = await dailyTrend(ADMIN, 7);
    expect(trend).toHaveLength(7);
    expect(trend.at(-1)!.ai_cost).toBeGreaterThanOrEqual(130);
  });
});

describe("controls are audit-logged", () => {
  it("suspend pauses the AI; plan, pilot days, overage and rates update", async () => {
    await setSuspended(ADMIN, TENANT_B, true);
    expect((await q(`select status from tenants where id = $1`, [TENANT_B]))[0].status).toBe("suspended");
    await grantPilotDays(ADMIN, TENANT_B, 7);
    expect((await q(`select status, pilot_ends_at > now() + interval '6 days' as extended from tenants where id = $1`, [TENANT_B]))[0]).toEqual({ status: "pilot", extended: true });
    await changePlan(ADMIN, TENANT_B, { plan: "growth" });
    await expect(changePlan(ADMIN, TENANT_B, { plan: "scale" })).rejects.toThrow(/custom conversation limit/);
    await changePlan(ADMIN, TENANT_B, { plan: "scale", limit: 9000 });
    await setOverage(ADMIN, TENANT_B, "bill_overage");
    expect((await q(`select plan, conversation_limit, overage_policy from tenants where id = $1`, [TENANT_B]))[0]).toEqual({ plan: "scale", conversation_limit: 9000, overage_policy: "bill_overage" });
    const actions = (await q(`select action from audit_log where actor_type = 'platform_admin' and tenant_id = $1 order by created_at`, [TENANT_B])).map((r) => r.action);
    expect(actions).toEqual(["admin.suspend", "admin.grant_pilot_days", "admin.change_plan", "admin.change_plan", "admin.set_overage"]);
  });

  it("rates are append-only and the newest effective one wins", async () => {
    await addRate(ADMIN, { key: "meta:utility:IN", value: 0.15, currency: "INR", unit: "per_message", effectiveFrom: new Date(Date.now() - 1000) });
    expect((await currentRates(ADMIN)).find((r) => r.key === "meta:utility:IN")!.value).toBe(0.15);
    expect((await q(`select count(*)::int as n from rates where key = 'meta:utility:IN'`))[0].n).toBe(2);
    await expect(addRate(ADMIN, { key: "x", value: 1, currency: "INR", unit: "per_message" })).rejects.toThrow();
    await expect(addRate(ADMIN, { key: "a:b:c", value: -1, currency: "INR", unit: "per_message" })).rejects.toThrow();
  });

  it("admin-assisted WhatsApp setup stores the token encrypted and is logged as assisted", async () => {
    const id = await saveWhatsAppChannel(TENANT_B, { id: ADMIN, type: "platform_admin" }, { phoneNumberId: "555000111", displayPhone: "+919811100000", accessToken: "EAAG-secret-token-123456" });
    const [ch] = await q(`select credentials_encrypted from channels where id = $1`, [id]);
    expect(ch.credentials_encrypted).not.toContain("EAAG");
    expect(decrypt(ch.credentials_encrypted)).toBe("EAAG-secret-token-123456");
    expect(await q(`select actor_type, metadata->>'assisted' as assisted from audit_log where target_id = $1`, [id])).toEqual([{ actor_type: "platform_admin", assisted: "true" }]);
    await expect(saveWhatsAppChannel(TENANT_A, { id: ADMIN, type: "platform_admin" }, { phoneNumberId: "555000111", displayPhone: "+919811100000", accessToken: "EAAG-other-token-123456" })).rejects.toThrow(/another business/);
  });
});

describe("CSV export", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    expect(toCsv([{ a: '=HYPERLINK("x")', b: "x,y", c: null }], ["a", "b", "c"])).toBe('a,b,c\n"\'=HYPERLINK(""x"")","x,y",\n');
  });
});

describe("spend alerts", () => {
  it("emails once per day when total AI spend or a tenant's spend crosses its threshold", async () => {
    expect(await checkSpendAlerts()).toEqual([]); // no settings yet
    await setAlertSettings(ADMIN, { email: "owner@chattybomb.test", dailyAiSpendInr: 50, tenantDailySpendInr: 25 });
    const first = await checkSpendAlerts();
    expect(first).toHaveLength(3); // total AI 130 > 50; tenant A 120 > 25; tenant B 30 > 25
    expect(mockAlerts.every((m) => m.to === "owner@chattybomb.test")).toBe(true);
    expect(await checkSpendAlerts()).toEqual([]); // deduped for today
    await expect(setAlertSettings(A_OWNER, { email: "x@example.com" })).rejects.toThrow(/platform admin only/);
  });
});
