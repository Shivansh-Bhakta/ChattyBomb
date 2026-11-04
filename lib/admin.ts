import { z } from "zod";
import { asService, type Db } from "./db.ts";
import { PLAN_LIMITS } from "./tenants.ts";

/**
 * Platform-owner console data. Every function runs as the service role ("scope: platform-admin")
 * and every mutation first proves the actor is a platform admin from the database, then audit-logs.
 */
export async function assertPlatformAdmin(db: Db, actorId: string) {
  const { rows: [u] } = await db.query(`select role from users where id = $1`, [actorId]);
  if (u?.role !== "platform_admin") throw new Error("platform admin only");
}

const AI_EVENTS = "('ai_input_tokens','ai_output_tokens','ai_cached_tokens','embedding_tokens')";
const META_EVENTS = "('wa_template_message','wa_service_message')";
const IN_MONTH = (col: string) => `date_trunc('month', timezone('Asia/Kolkata', ${col})) = date_trunc('month', timezone('Asia/Kolkata', now()))`;

export type TenantRow = {
  id: string; name: string; plan: string; status: string; conversation_limit: number; overage_policy: string; pilot_ends_at: Date | null;
  conversations: number; ai_cost: number; meta_fees: number; plan_revenue: number;
  revenue: number; cost: number; margin: number; margin_pct: number | null; negative_margin: boolean; near_limit: boolean;
};

/**
 * Per-tenant month-to-date economics. Revenue = active subscription price + Meta fees recovered
 * (passed through at cost to paying tenants); cost = AI + Meta. Estimates: tokens x our rates.
 */
export async function tenantMetrics(actorId: string): Promise<TenantRow[]> {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows } = await db.query(
      `with u as (
         select tenant_id,
           coalesce(sum(total_cost_inr) filter (where event_type in ${AI_EVENTS}), 0)::float as ai_cost,
           coalesce(sum(total_cost_inr) filter (where event_type in ${META_EVENTS}), 0)::float as meta_fees,
           count(*) filter (where event_type = 'conversation_billed')::int as conversations
         from usage_events where ${IN_MONTH("created_at")} group by tenant_id)
       select t.id, t.name, t.plan, t.status, t.conversation_limit, t.overage_policy, t.pilot_ends_at,
         coalesce(u.conversations, 0) as conversations, coalesce(u.ai_cost, 0) as ai_cost, coalesce(u.meta_fees, 0) as meta_fees,
         coalesce((select s.amount_paise from subscriptions s where s.tenant_id = t.id and s.status = 'active' order by s.created_at desc limit 1), 0)::float / 100 as plan_revenue
       from tenants t left join u on u.tenant_id = t.id order by t.name`);
    return rows.map((r) => {
      const paying = r.plan_revenue > 0;
      const revenue = r.plan_revenue + (paying ? r.meta_fees : 0);
      const cost = r.ai_cost + r.meta_fees;
      const margin = Math.round((revenue - cost) * 100) / 100; // paise precision: sub-paisa costs are not a loss
      return { ...r, revenue, cost, margin: margin === 0 ? 0 : margin, margin_pct: revenue > 0 ? margin / revenue : null,
        negative_margin: margin < 0, near_limit: r.conversation_limit > 0 && r.conversations >= 0.8 * r.conversation_limit };
    });
  });
}

export function overview(rows: TenantRow[]) {
  const sum = (f: (r: TenantRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const revenue = sum((r) => r.revenue), margin = sum((r) => r.margin);
  return {
    mrr: sum((r) => (r.status === "active" ? r.plan_revenue : 0)),
    activeTenants: rows.filter((r) => r.status === "active").length,
    pilots: rows.filter((r) => r.status === "pilot").length,
    conversations: sum((r) => r.conversations),
    aiCost: sum((r) => r.ai_cost), metaFees: sum((r) => r.meta_fees),
    revenue, margin, marginPct: revenue > 0 ? margin / revenue : null,
  };
}

/** Last `days` IST days: AI cost, Meta fees, conversations per day (zero-filled). */
export async function dailyTrend(actorId: string, days = 30) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows } = await db.query(
      `with d as (select generate_series(timezone('Asia/Kolkata', now())::date - ($1 - 1), timezone('Asia/Kolkata', now())::date, '1 day')::date as day)
       select to_char(d.day, 'YYYY-MM-DD') as day,
         coalesce(sum(u.total_cost_inr) filter (where u.event_type in ${AI_EVENTS}), 0)::float as ai_cost,
         coalesce(sum(u.total_cost_inr) filter (where u.event_type in ${META_EVENTS}), 0)::float as meta_fees,
         count(u.id) filter (where u.event_type = 'conversation_billed')::int as conversations
       from d left join usage_events u on timezone('Asia/Kolkata', u.created_at)::date = d.day
       group by d.day order by d.day`, [days]);
    return rows as { day: string; ai_cost: number; meta_fees: number; conversations: number }[];
  });
}

/** Top conversations by estimated cost this month, optionally for one tenant. */
export async function topConversations(actorId: string, tenantId: string | null, limit = 20) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows } = await db.query(
      `select c.id, t.name as tenant, ct.name as contact, ch.type as channel, c.status,
              sum(u.total_cost_inr)::float as cost, count(u.id)::int as events
         from usage_events u join conversations c on c.id = u.conversation_id join tenants t on t.id = c.tenant_id
         join contacts ct on ct.id = c.contact_id join channels ch on ch.id = c.channel_id
        where ${IN_MONTH("u.created_at")} and ($1::uuid is null or u.tenant_id = $1)
        group by c.id, t.name, ct.name, ch.type, c.status order by cost desc limit $2`, [tenantId, limit]);
    return rows;
  });
}

/** One tenant's month: cost by channel and event, cost per resolved conversation, prompt-cache hit rate. */
export async function tenantDetail(actorId: string, tenantId: string) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows: [tenant] } = await db.query(`select * from tenants where id = $1`, [tenantId]);
    if (!tenant) return null;
    const { rows: breakdown } = await db.query(
      `select coalesce(channel::text, '-') as channel, event_type, sum(quantity)::float as quantity, sum(total_cost_inr)::float as cost,
              count(*) filter (where meta ? 'unpriced')::int as unpriced
         from usage_events where tenant_id = $1 and ${IN_MONTH("created_at")} group by 1, 2 order by cost desc`, [tenantId]);
    const { rows: [k] } = await db.query(
      `select
         coalesce((select sum(total_cost_inr) from usage_events where tenant_id = $1 and event_type <> 'conversation_billed' and ${IN_MONTH("created_at")}), 0)::float as cost,
         (select count(*) from conversations where tenant_id = $1 and status = 'resolved' and resolved_at is not null and ${IN_MONTH("resolved_at")})::int as resolved,
         coalesce((select sum(quantity) from usage_events where tenant_id = $1 and event_type = 'ai_cached_tokens' and ${IN_MONTH("created_at")}), 0)::float as cached,
         coalesce((select sum(quantity) from usage_events where tenant_id = $1 and event_type = 'ai_input_tokens' and ${IN_MONTH("created_at")}), 0)::float as input`, [tenantId]);
    const { rows: channels } = await db.query(`select id, type, provider, status, external_id, last_error, connected_at from channels where tenant_id = $1 order by type`, [tenantId]);
    return {
      tenant, breakdown, channels,
      costPerResolved: k.resolved ? k.cost / k.resolved : null,
      cacheHitRate: k.cached + k.input > 0 ? k.cached / (k.cached + k.input) : null,
    };
  });
}

// ── Controls ───────────────────────────────────────────────────────────────
async function adminUpdate(actorId: string, tenantId: string, action: string, sql: string, params: unknown[], metadata: object) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rowCount } = await db.query(sql, [tenantId, ...params]);
    if (!rowCount) throw new Error("tenant not found");
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values ($1, 'platform_admin', $2, $3, 'tenant', $1, $4)`,
      [tenantId, actorId, action, metadata]);
  });
}

export const setSuspended = (actorId: string, tenantId: string, suspend: boolean) =>
  adminUpdate(actorId, tenantId, suspend ? "admin.suspend" : "admin.unsuspend",
    // Unsuspend returns to 'active' if they pay, otherwise 'pilot'.
    `update tenants set status = case when $2 then 'suspended'::tenant_status
       when exists (select 1 from subscriptions s where s.tenant_id = tenants.id and s.status = 'active') then 'active'::tenant_status else 'pilot'::tenant_status end
     where id = $1`, [suspend], { suspend });

export const planSchema = z.object({ plan: z.enum(["starter", "growth", "scale"]), limit: z.coerce.number().int().min(1).max(1_000_000).optional() });
export async function changePlan(actorId: string, tenantId: string, input: z.input<typeof planSchema>) {
  const { plan, limit } = planSchema.parse(input);
  const conversationLimit = plan === "scale" ? limit : PLAN_LIMITS[plan];
  if (!conversationLimit) throw new Error("scale plan needs a custom conversation limit");
  return adminUpdate(actorId, tenantId, "admin.change_plan", `update tenants set plan = $2, conversation_limit = $3 where id = $1`, [plan, conversationLimit], { plan, conversation_limit: conversationLimit });
}

export async function grantPilotDays(actorId: string, tenantId: string, days: number) {
  const n = z.number().int().min(1).max(90).parse(days);
  return adminUpdate(actorId, tenantId, "admin.grant_pilot_days",
    `update tenants set pilot_ends_at = greatest(coalesce(pilot_ends_at, now()), now()) + make_interval(days => $2),
       status = case when status = 'suspended' then 'pilot'::tenant_status else status end where id = $1 and status in ('pilot', 'suspended')`,
    [n], { days: n });
}

export async function setOverage(actorId: string, tenantId: string, policy: string) {
  const p = z.enum(["pause_ai", "bill_overage"]).parse(policy);
  return adminUpdate(actorId, tenantId, "admin.set_overage", `update tenants set overage_policy = $2 where id = $1`, [p], { overage_policy: p });
}

export async function setTenantAlert(actorId: string, tenantId: string, inr: number | null) {
  const v = inr === null ? null : z.number().min(0).max(10_000_000).parse(inr);
  return adminUpdate(actorId, tenantId, "admin.set_tenant_alert", `update tenants set alert_daily_spend_inr = $2 where id = $1`, [v], { alert_daily_spend_inr: v });
}

export const RATE_UNITS = ["per_mtok", "per_message", "per_mb", "inr_per_usd", "per_month", "per_conversation"] as const;
export const rateSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_.:-]{3,120}$/i, "key like anthropic:<model>:input_per_mtok"),
  value: z.coerce.number().min(0).max(1_000_000),
  currency: z.enum(["USD", "INR"]),
  unit: z.enum(RATE_UNITS),
  effectiveFrom: z.coerce.date().optional(),
  note: z.string().trim().max(300).optional(),
});

/** Rates are append-only: a change is a new row with a later effective_from, so history stays priced as it was. */
export async function addRate(actorId: string, input: z.input<typeof rateSchema>) {
  const r = rateSchema.parse(input);
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows: [row] } = await db.query(
      `insert into rates (key, value, currency, unit, effective_from, note) values ($1, $2, $3, $4, $5, $6) returning id`,
      [r.key, r.value, r.currency, r.unit, r.effectiveFrom ?? new Date(), r.note ?? null]);
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values (null, 'platform_admin', $1, 'admin.add_rate', 'rate', $2, $3)`,
      [actorId, row.id, { key: r.key, value: r.value, currency: r.currency, unit: r.unit }]);
    return row.id as string;
  });
}

export async function currentRates(actorId: string) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows } = await db.query(
      `select distinct on (key) key, value::float, currency, unit, effective_from, note from rates where effective_from <= now() order by key, effective_from desc`);
    return rows;
  });
}

/** CSV with formula-injection protection (cells starting = + - @ are prefixed with '). */
export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

export async function logAdminAction(actorId: string, action: string, metadata: object) {
  await asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    await db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action, metadata) values (null, 'platform_admin', $1, $2, $3)`, [actorId, action, metadata]);
  });
}

/** Outbound sends whose outcome is unknown (crash/timeout after the provider call). Needs a human check. */
export async function unknownSends(actorId: string) {
  return asService(async (db) => { // scope: platform-admin
    await assertPlatformAdmin(db, actorId);
    const { rows } = await db.query(
      `select m.id, t.name as tenant, m.conversation_id, m.body, m.error, m.created_at from messages m join tenants t on t.id = m.tenant_id
        where m.direction = 'outbound' and m.status = 'sending' and m.created_at < now() - interval '10 minutes' order by m.created_at limit 100`);
    return rows;
  });
}
