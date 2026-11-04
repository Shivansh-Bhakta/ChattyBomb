import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asService, closePool } from "../db.ts";
import { mockOutbox } from "./mock.ts";
import { sendMessage } from "./outbound.ts";
import { whatsapp } from "./whatsapp.ts";
import { CONV_A1, TENANT_A } from "../../test/ids.ts";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });
afterEach(() => vi.restoreAllMocks());
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const text = (t: string) => ({ kind: "text" as const, text: t });

describe("outbound exactly-once", () => {
  it("does not re-send when the provider accepted the message but the DB update crashed", async () => {
    // Simulate a crash right after the provider call: recording 'sent' fails for this body.
    await q(`create or replace function crash_on_sent() returns trigger language plpgsql as $$
      begin if new.status = 'sent' and new.body = 'CRASH' then raise exception 'simulated crash after send'; end if; return new; end $$`);
    await q(`create trigger crash_on_sent before update on messages for each row execute function crash_on_sent()`);
    try {
      await expect(sendMessage(TENANT_A, CONV_A1, text("CRASH"), { type: "ai" }, { idempotencyKey: "k-crash" })).rejects.toThrow(/simulated crash/);
      expect(mockOutbox).toHaveLength(1);
      const [row] = await q(`select status, provider_message_id from messages where idempotency_key = 'k-crash'`);
      expect(row).toEqual({ status: "sending", provider_message_id: null });

      const retry = await sendMessage(TENANT_A, CONV_A1, text("CRASH"), { type: "ai" }, { idempotencyKey: "k-crash" });
      expect(retry.duplicate).toBe(true);
      expect(mockOutbox).toHaveLength(1); // still one send
      expect(await q(`select 1 from usage_events where meta->>'message_id' = $1`, [retry.messageId])).toHaveLength(0); // not double-billed
    } finally {
      await q(`drop trigger crash_on_sent on messages; drop function crash_on_sent()`);
    }
  });

  it("re-sends once after a definite provider failure, and never after success", async () => {
    vi.spyOn(whatsapp, "send").mockRejectedValueOnce(new Error("WhatsApp send failed (500)"));
    await expect(sendMessage(TENANT_A, CONV_A1, text("retry me"), { type: "ai" }, { idempotencyKey: "k-fail" })).rejects.toThrow(/500/);
    expect((await q(`select status from messages where idempotency_key = 'k-fail'`))[0].status).toBe("failed");

    const ok = await sendMessage(TENANT_A, CONV_A1, text("retry me"), { type: "ai" }, { idempotencyKey: "k-fail" });
    expect(ok.duplicate).toBeUndefined();
    const again = await sendMessage(TENANT_A, CONV_A1, text("retry me"), { type: "ai" }, { idempotencyKey: "k-fail" });
    expect(again).toMatchObject({ messageId: ok.messageId, providerMessageId: ok.providerMessageId, duplicate: true });
    expect(mockOutbox).toHaveLength(1);
    expect(await q(`select status from messages where idempotency_key = 'k-fail'`)).toEqual([{ status: "sent" }]);
    expect(await q(`select 1 from usage_events where meta->>'message_id' = $1`, [ok.messageId])).toHaveLength(1);
  });

  it("treats a provider timeout as unknown and does not re-send", async () => {
    const timeout = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    vi.spyOn(whatsapp, "send").mockRejectedValueOnce(timeout);
    await expect(sendMessage(TENANT_A, CONV_A1, text("slow"), { type: "ai" }, { idempotencyKey: "k-timeout" })).rejects.toThrow(/timed out/);
    expect((await q(`select status, error from messages where idempotency_key = 'k-timeout'`))[0]).toMatchObject({ status: "sending", error: expect.stringMatching(/^outcome unknown/) });
    const retry = await sendMessage(TENANT_A, CONV_A1, text("slow"), { type: "ai" }, { idempotencyKey: "k-timeout" });
    expect(retry.duplicate).toBe(true);
    expect(mockOutbox).toHaveLength(0);
  });

  it("concurrent retries with the same key send once", async () => {
    const results = await Promise.all([1, 2, 3].map(() => sendMessage(TENANT_A, CONV_A1, text("race"), { type: "ai" }, { idempotencyKey: "k-race" })));
    expect(mockOutbox).toHaveLength(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
  });
});
