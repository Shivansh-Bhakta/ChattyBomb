import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, closePool } from "./db.ts";
import { markConversationBilled } from "./metering.ts";
import { deleteTenant } from "./tenants.ts";
import { usageSummary } from "./usage.ts";
import { A_AGENT, A_OWNER, ADMIN, B_OWNER, CONV_A1, CONV_A2, TENANT_A, TENANT_B } from "../test/ids.ts";

afterAll(closePool);
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const TABLES = ["users", "channels", "contacts", "conversations", "messages", "documents", "chunks", "leads", "reminders", "usage_events", "subscriptions", "invoices", "audit_log"];
const counts = async (tenantId: string) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await q(`select count(*)::int as n from ${t} where tenant_id = $1`, [tenantId]))[0].n])));

describe("plan limits", () => {
  it("reports usage vs limit and warns at 80%", async () => {
    await q(`update tenants set conversation_limit = 2 where id = $1`, [TENANT_A]);
    await asService(async (db) => { await markConversationBilled(db, TENANT_A, CONV_A1, "whatsapp"); });
    let u = await asUser(A_AGENT, (db) => usageSummary(db, TENANT_A));
    expect(u).toMatchObject({ used: 1, limit: 2, pct: 50, warn: false, over: false });
    await asService(async (db) => { await markConversationBilled(db, TENANT_A, CONV_A2, "whatsapp"); });
    u = await asUser(A_AGENT, (db) => usageSummary(db, TENANT_A));
    expect(u).toMatchObject({ used: 2, pct: 100, warn: true, over: false, aiPaused: false });
    // Another tenant's usage summary is not readable through RLS.
    await expect(asUser(A_OWNER, (db) => usageSummary(db, TENANT_B))).rejects.toThrow(/not found/);
  });
});

describe("tenant data deletion", () => {
  it("refuses agents, other tenants' owners and a wrong confirmation", async () => {
    await expect(deleteTenant(TENANT_A, A_AGENT, "Sunrise Clinic")).rejects.toThrow(/only the owner/);
    await expect(deleteTenant(TENANT_A, B_OWNER, "Sunrise Clinic")).rejects.toThrow(/only the owner/);
    await expect(deleteTenant(TENANT_A, A_OWNER, "sunrise clinic")).rejects.toThrow(/does not match/);
    expect((await counts(TENANT_A)).conversations).toBeGreaterThan(0);
  });

  it("deletes every row, file and login of the tenant and nothing of other tenants", async () => {
    const dir = join(process.cwd(), ".mock-storage", "tenants", TENANT_A);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "doc1"), "x");
    const before = await counts(TENANT_B);
    const res = await deleteTenant(TENANT_A, A_OWNER, "Sunrise Clinic");
    expect(res).toEqual({ name: "Sunrise Clinic", problems: [] });
    expect(Object.values(await counts(TENANT_A)).every((n) => n === 0)).toBe(true);
    expect(await q(`select 1 from tenants where id = $1`, [TENANT_A])).toHaveLength(0);
    expect(await q(`select 1 from auth.users where id = any($1::uuid[])`, [[A_OWNER, A_AGENT]])).toHaveLength(0);
    await expect(access(dir)).rejects.toThrow();
    expect(await counts(TENANT_B)).toEqual(before);
    expect(await q(`select metadata->>'name' as name from audit_log where action = 'tenant.delete' and target_id = $1`, [TENANT_A])).toEqual([{ name: "Sunrise Clinic" }]);
    expect(await q(`select 1 from users where id = $1`, [ADMIN])).toHaveLength(1);
  });
});
