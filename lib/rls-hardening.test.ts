import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, closePool } from "./db.ts";
import { A_AGENT, A_OWNER, ADMIN, B_OWNER, CHANNEL_A, CONV_A1, CONV_B1, TENANT_A, TENANT_B } from "../test/ids.ts";

afterAll(closePool);
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const CONTACT_A1 = "30000000-0000-0000-0000-0000000000a1", CONTACT_B1 = "30000000-0000-0000-0000-0000000000b1";
const denied = /permission denied|row-level security|another tenant|only add their own|as yourself/;

describe("RLS hardening (0005)", () => {
  it("every public table has RLS enabled", async () => {
    const rows = await q(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("anon can read nothing", async () => {
    await expect(asService(async (db) => { await db.query("set local role anon"); return db.query("select 1 from tenants"); })).rejects.toThrow(/permission denied/);
  });

  it("members cannot point their rows at another tenant's rows", async () => {
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status) values ($1, $2, 'note', 'agent', $3, 'x', 'received')`, [TENANT_A, CONV_B1, A_AGENT]))).rejects.toThrow(denied);
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into reminders (tenant_id, contact_id, conversation_id, type, due_at, message, created_by) values ($1, $2, $3, 'callback', now(), 'x', $4)`, [TENANT_A, CONTACT_B1, CONV_B1, A_AGENT]))).rejects.toThrow(denied);
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into reminders (tenant_id, contact_id, conversation_id, type, due_at, message, created_by) values ($1, $2, $3, 'callback', now(), 'x', $4)`, [TENANT_A, CONTACT_A1, CONV_B1, A_AGENT]))).rejects.toThrow(denied);
    await expect(asUser(A_OWNER, (db) => db.query(`update conversations set assignee_id = $2 where id = $1`, [CONV_A1, B_OWNER]))).rejects.toThrow(denied);
    // Even service-role code cannot create cross-tenant references.
    await expect(q(`insert into leads (tenant_id, contact_id, conversation_id, intent, source_channel) values ($1, $2, $3, 'booking', 'whatsapp')`, [TENANT_A, CONTACT_B1, CONV_B1])).rejects.toThrow(/another tenant/);
  });

  it("members cannot impersonate a colleague or rewrite history", async () => {
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status) values ($1, $2, 'note', 'agent', $3, 'x', 'received')`, [TENANT_A, CONV_A1, A_OWNER]))).rejects.toThrow(denied);
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status) values ($1, $2, 'outbound', 'ai', null, 'fake AI reply', 'sent')`, [TENANT_A, CONV_A1]))).rejects.toThrow(denied);
    await expect(asUser(A_AGENT, (db) => db.query(
      `insert into reminders (tenant_id, contact_id, conversation_id, type, due_at, message, created_by) values ($1, $2, $3, 'callback', now(), 'x', $4)`, [TENANT_A, CONTACT_A1, CONV_A1, A_OWNER]))).rejects.toThrow(denied);
    await expect(asUser(A_OWNER, (db) => db.query(`update messages set body = 'edited' where conversation_id = $1`, [CONV_A1]))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(`delete from audit_log`))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action) values ($1, 'ai', $2, 'ai.reply')`, [TENANT_A, A_OWNER]))).rejects.toThrow(/row-level security/);
    // The legitimate path still works: an agent's own note.
    await asUser(A_AGENT, (db) => db.query(
      `insert into messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, body, status) values ($1, $2, 'note', 'agent', $3, 'ok', 'received')`, [TENANT_A, CONV_A1, A_AGENT]));
  });

  it("owners cannot hijack logins or channel routing, or extend the WhatsApp window", async () => {
    const outsider = (await q("insert into auth.users (email) values ('victim@x.test') returning id"))[0].id;
    await expect(asUser(A_OWNER, (db) => db.query(`update users set id = $2 where id = $1`, [A_AGENT, outsider]))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(`update channels set external_id = 'mock-phone-glow' where id = $1`, [CHANNEL_A]))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(
      `insert into channels (tenant_id, type, provider, status, external_id) values ($1, 'whatsapp', 'meta', 'connected', 'someone-elses-number')`, [TENANT_A]))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(`update conversations set last_inbound_at = now() where id = $1`, [CONV_A1]))).rejects.toThrow(/permission denied/);
    // Legitimate owner writes still work.
    expect((await asUser(A_OWNER, (db) => db.query(`update channels set config = config || '{"x":1}' where id = $1`, [CHANNEL_A]))).rowCount).toBe(1);
  });

  it("tenants cannot read our rates or unit costs; platform admins can read rates", async () => {
    expect((await asUser(A_OWNER, (db) => db.query("select 1 from rates"))).rowCount).toBe(0);
    await expect(asUser(A_OWNER, (db) => db.query("select total_cost_inr from usage_events"))).rejects.toThrow(/permission denied/);
    expect((await asUser(A_OWNER, (db) => db.query("select event_type, quantity from usage_events"))).rowCount).toBeGreaterThanOrEqual(0);
    expect((await asUser(ADMIN, (db) => db.query("select 1 from rates"))).rowCount).toBeGreaterThan(0);
    expect(TENANT_B).toBeTruthy();
  });
});

describe("reviewer findings on 0005 (0007)", () => {
  it("platform admins can write audit entries as platform_admin, tenants still cannot spoof it", async () => {
    await asUser(ADMIN, (db) => db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action) values ($1, 'platform_admin', $2, 'admin.test')`, [TENANT_A, ADMIN]));
    await expect(asUser(A_OWNER, (db) => db.query(`insert into audit_log (tenant_id, actor_type, actor_user_id, action) values ($1, 'platform_admin', $2, 'x')`, [TENANT_A, A_OWNER]))).rejects.toThrow(/row-level security/);
  });

  it("members cannot read stored channel credentials", async () => {
    await expect(asUser(A_AGENT, (db) => db.query(`select credentials_encrypted from channels`))).rejects.toThrow(/permission denied/);
    await expect(asUser(A_OWNER, (db) => db.query(`select * from channels`))).rejects.toThrow(/permission denied/);
    expect((await asUser(A_OWNER, (db) => db.query(`select id, config from channels`))).rowCount).toBeGreaterThan(0);
  });
});
