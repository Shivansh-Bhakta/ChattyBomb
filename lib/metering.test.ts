import { afterAll, describe, expect, it } from "vitest";
import { asService, closePool } from "./db.ts";
import { conversationsThisMonth, markConversationBilled, record, recordAnthropicUsage } from "./metering.ts";
import { CONV_A1, TENANT_A } from "../test/ids.ts";

afterAll(closePool);

// Every test runs in a rolled-back transaction so the ledger stays clean.
const inTx = (fn: (db: import("./db.ts").Db) => Promise<void>) =>
  asService(async (db) => { await fn(db); throw new Error("rollback"); }).catch((e) => { if (e.message !== "rollback") throw e; });

const lastRows = async (db: import("./db.ts").Db, n: number) =>
  (await db.query(`select event_type, quantity::float, unit_cost_inr::float, total_cost_inr::float, rate_id, meta from usage_events order by created_at desc, id limit $1`, [n])).rows;

describe("cost ledger", () => {
  it("prices with the latest effective rate and converts USD to INR", () => inTx(async (db) => {
    await db.query(`insert into rates (key, value, currency, unit, effective_from) values
      ('test:model:input_per_mtok', 2, 'USD', 'per_mtok', now() - interval '10 days'),
      ('test:model:input_per_mtok', 4, 'USD', 'per_mtok', now() - interval '1 day'),
      ('test:model:input_per_mtok', 99, 'USD', 'per_mtok', now() + interval '1 day')`);
    await record(db, { tenantId: TENANT_A, eventType: "ai_input_tokens", quantity: 500_000, rateKey: "test:model:input_per_mtok" });
    const [row] = await lastRows(db, 1);
    // 4 USD/Mtok * 85 INR/USD = 340 INR/Mtok → 0.00034/token → 170 INR
    expect(row.unit_cost_inr).toBeCloseTo(0.00034, 6);
    expect(row.total_cost_inr).toBeCloseTo(170, 4);
  }));

  it("keeps the row with zero cost when a rate is missing (never blocks, never guesses)", () => inTx(async (db) => {
    await record(db, { tenantId: TENANT_A, eventType: "wa_template_message", quantity: 1, rateKey: "meta:marketing:XX" });
    const [row] = await lastRows(db, 1);
    expect(row).toMatchObject({ total_cost_inr: 0, rate_id: null, meta: { missing_rate: "meta:marketing:XX" } });
  }));

  it("splits Anthropic usage into input, output, cache read and cache write rows", () => inTx(async (db) => {
    await recordAnthropicUsage(db, { tenantId: TENANT_A, conversationId: CONV_A1 }, "claude-haiku-5-5",
      { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 });
    const rows = await lastRows(db, 3);
    expect(rows.map((r) => r.event_type).sort()).toEqual(["ai_cached_tokens", "ai_input_tokens", "ai_output_tokens"]);
    expect(rows.every((r) => r.rate_id)).toBe(true);
  }));

  it("rejects negative or non-numeric quantities", () => inTx(async (db) => {
    await expect(record(db, { tenantId: TENANT_A, eventType: "storage_mb", quantity: -1, rateKey: null })).rejects.toThrow();
    await expect(record(db, { tenantId: TENANT_A, eventType: "storage_mb", quantity: NaN, rateKey: null })).rejects.toThrow();
  }));

  it("counts a conversation once per calendar month", () => inTx(async (db) => {
    const before = await conversationsThisMonth(db, TENANT_A);
    expect(await markConversationBilled(db, TENANT_A, CONV_A1, "whatsapp")).toBe(true);
    expect(await markConversationBilled(db, TENANT_A, CONV_A1, "whatsapp")).toBe(false);
    expect(await conversationsThisMonth(db, TENANT_A)).toBe(before + 1);
  }));
});
