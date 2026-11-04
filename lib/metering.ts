import type { Db } from "./db.ts";

export type Channel = "whatsapp" | "slack" | "email";
export type UsageEventType =
  | "ai_input_tokens" | "ai_output_tokens" | "ai_cached_tokens" | "embedding_tokens"
  | "wa_template_message" | "wa_service_message" | "storage_mb" | "conversation_billed";

/** Rate units understood by the ledger. Prices live only in the `rates` table. */
const UNIT_DIVISOR: Record<string, number> = { per_mtok: 1_000_000, per_message: 1, per_mb: 1 };

type Rate = { id: string; value: string; currency: "USD" | "INR"; unit: string };

export async function currentRate(db: Db, key: string, at = new Date()): Promise<Rate | null> {
  const { rows } = await db.query(
    `select id, value, currency, unit from rates where key = $1 and effective_from <= $2 order by effective_from desc limit 1`,
    [key, at],
  );
  return rows[0] ?? null;
}

/** INR cost of one unit (one token, one message, one MB) under this rate. */
async function inrPerUnit(db: Db, rate: Rate, at: Date): Promise<number> {
  const divisor = UNIT_DIVISOR[rate.unit];
  if (!divisor) throw new Error(`unknown rate unit: ${rate.unit}`);
  let value = Number(rate.value);
  if (rate.currency === "USD") {
    const fx = await currentRate(db, "fx:USD_INR", at);
    if (!fx) throw new Error("missing rate fx:USD_INR");
    value *= Number(fx.value);
  }
  return value / divisor;
}

export type UsageInput = {
  tenantId: string;
  conversationId?: string | null;
  channel?: Channel | null;
  eventType: UsageEventType;
  quantity: number;
  rateKey: string | null;
  model?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Writes one usage_events row. A missing rate never blocks the billable action, and is never silent:
 * the row keeps its quantity (so it can be re-priced) with cost 0 and meta.unpriced=true, a platform-only
 * `metering.unpriced` audit event is written (tenant_id null, invisible to tenants), and console.error fires.
 */
export async function record(db: Db, u: UsageInput) {
  if (!Number.isFinite(u.quantity) || u.quantity < 0) throw new Error("quantity must be a non-negative number");
  const at = new Date();
  let rateId: string | null = null, unit = 0, meta = u.meta ?? {}, unpriced = false;
  if (u.rateKey) {
    try {
      const rate = await currentRate(db, u.rateKey, at);
      if (!rate) throw new Error(`missing rate ${u.rateKey}`);
      unit = await inrPerUnit(db, rate, at);
      rateId = rate.id;
    } catch (e) {
      console.error(`[metering] UNPRICED ${u.eventType} x${u.quantity} for tenant ${u.tenantId}: ${(e as Error).message}`);
      meta = { ...meta, unpriced: true, missing_rate: u.rateKey };
      unpriced = true;
    }
  }
  const { rows: [row] } = await db.query(
    `insert into usage_events (tenant_id, conversation_id, channel, event_type, quantity, rate_id, unit_cost_inr, total_cost_inr, model, meta)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [u.tenantId, u.conversationId ?? null, u.channel ?? null, u.eventType, u.quantity, rateId, unit, unit * u.quantity, u.model ?? null, meta],
  );
  if (unpriced) {
    await db.query(
      `insert into audit_log (tenant_id, actor_type, action, target_type, target_id, metadata) values (null, 'system', 'metering.unpriced', 'usage_event', $1, $2)`,
      [row.id, { tenant_id: u.tenantId, rate_key: u.rateKey, event_type: u.eventType, quantity: u.quantity }],
    );
  }
}

/** Platform-admin warning counter: unpriced usage rows in the last `days` days, by rate key. */
export async function unpricedSummary(db: Db, days = 30) {
  const { rows } = await db.query(
    `select metadata->>'rate_key' as rate_key, count(*)::int as events from audit_log
      where action = 'metering.unpriced' and tenant_id is null and created_at > now() - make_interval(days => $1)
      group by 1 order by 2 desc`,
    [days],
  );
  return { total: rows.reduce((n, r) => n + r.events, 0), byRateKey: rows as { rate_key: string; events: number }[] };
}

/** Anthropic response `usage` → one ledger row per non-zero component. */
export async function recordAnthropicUsage(
  db: Db,
  base: { tenantId: string; conversationId?: string | null; channel?: Channel | null },
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  const parts: [UsageEventType, number, string][] = [
    ["ai_input_tokens", usage.input_tokens, "input_per_mtok"],
    ["ai_output_tokens", usage.output_tokens, "output_per_mtok"],
    ["ai_cached_tokens", usage.cache_read_input_tokens ?? 0, "cache_read_per_mtok"],
    ["ai_input_tokens", usage.cache_creation_input_tokens ?? 0, "cache_write_per_mtok"],
  ];
  for (const [eventType, quantity, suffix] of parts) {
    if (quantity > 0) await record(db, { ...base, eventType, quantity, model, rateKey: `anthropic:${model}:${suffix}` });
  }
}

/**
 * Counts a conversation once per calendar month (IST). Returns true if newly counted.
 * shortcut: month boundary fixed to Asia/Kolkata (all current tenants), per-tenant timezone when going abroad.
 */
export async function markConversationBilled(db: Db, tenantId: string, conversationId: string, channel: Channel) {
  const { rowCount } = await db.query(
    `insert into usage_events (tenant_id, conversation_id, channel, event_type, quantity)
     values ($1, $2, $3, 'conversation_billed', 1)
     on conflict (conversation_id, date_trunc('month', timezone('Asia/Kolkata', created_at)))
       where event_type = 'conversation_billed' do nothing`,
    [tenantId, conversationId, channel],
  );
  return rowCount === 1;
}

export async function conversationsThisMonth(db: Db, tenantId: string): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from usage_events
     where tenant_id = $1 and event_type = 'conversation_billed'
       and date_trunc('month', timezone('Asia/Kolkata', created_at)) = date_trunc('month', timezone('Asia/Kolkata', now()))`,
    [tenantId],
  );
  return rows[0].n;
}
