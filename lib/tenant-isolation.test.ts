import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, closePool } from "./db.ts";
import { createTenant } from "./tenants.ts";
import { A_AGENT, A_OWNER, ADMIN, B_OWNER, CHANNEL_A, CONV_A1, CONV_B1, TENANT_A, TENANT_B } from "../test/ids.ts";

afterAll(closePool);

describe("tenant isolation (RLS)", () => {
  it("tenant A cannot read tenant B rows in any tenant table", async () => {
    await asUser(A_OWNER, async (db) => {
      for (const t of ["tenants", "users", "channels", "contacts", "conversations", "messages", "usage_events", "audit_log"]) {
        const col = t === "tenants" ? "id" : "tenant_id";
        const { rows } = await db.query(`select distinct ${col} as t from ${t}`);
        expect(rows.every((r) => r.t === TENANT_A), t).toBe(true);
      }
      expect((await db.query("select 1 from conversations where id = $1", [CONV_B1])).rowCount).toBe(0);
      expect((await db.query("select 1 from messages where conversation_id = $1", [CONV_B1])).rowCount).toBe(0);
    });
    await asUser(B_OWNER, async (db) => {
      expect((await db.query("select 1 from conversations where id = $1", [CONV_A1])).rowCount).toBe(0);
      expect((await db.query("select count(*)::int as n from conversations")).rows[0].n).toBe(1);
    });
  });

  it("tenant A cannot write into or modify tenant B", async () => {
    await asUser(A_OWNER, async (db) => {
      expect((await db.query("update conversations set status = 'resolved' where id = $1", [CONV_B1])).rowCount).toBe(0);
    });
    await expect(asUser(A_OWNER, (db) => db.query("delete from messages where conversation_id = $1", [CONV_B1]))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A_OWNER, (db) => db.query("insert into contacts (tenant_id, name) values ($1, 'x')", [TENANT_B])),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it("agents cannot manage channels or users; owners cannot change their own plan", async () => {
    await asUser(A_AGENT, async (db) => {
      expect((await db.query("update channels set config = '{}' where id = $1", [CHANNEL_A])).rowCount).toBe(0);
      expect((await db.query("update users set role = 'owner' where id = $1", [A_AGENT])).rowCount).toBe(0);
    });
    await expect(
      asUser(A_OWNER, (db) => db.query("update tenants set plan = 'scale' where id = $1", [TENANT_A])),
    ).rejects.toThrow(/permission denied/);
  });

  it("owners cannot attach another login to their tenant", async () => {
    const outsider = (await asService((db) => db.query("insert into auth.users (email) values ('outsider@x.test') returning id"))).rows[0].id;
    await expect(
      asUser(A_OWNER, (db) => db.query("insert into users (id, tenant_id, role, email) values ($1, $2, 'agent', 'outsider@x.test')", [outsider, TENANT_A])),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it("no session sees nothing; webhook_events is service-only; admin sees all", async () => {
    await asUser("00000000-0000-0000-0000-00000000dead", async (db) => {
      expect((await db.query("select 1 from conversations")).rowCount).toBe(0);
    });
    await expect(asUser(A_OWNER, (db) => db.query("select 1 from webhook_events"))).rejects.toThrow(/permission denied/);
    await asUser(ADMIN, async (db) => {
      expect((await db.query("select count(distinct tenant_id)::int as n from conversations")).rows[0].n).toBe(2);
    });
  });

  it("onboarding creates a pilot tenant visible only to its owner", async () => {
    const uid = (await asService((db) => db.query("insert into auth.users (email) values ('new@biz.test') returning id"))).rows[0].id;
    const tenantId = await createTenant(uid, "new@biz.test", { businessName: "New Biz", ownerName: "Asha" });
    await asUser(uid, async (db) => {
      const { rows } = await db.query("select id, status from tenants");
      expect(rows).toEqual([{ id: tenantId, status: "pilot" }]);
      expect((await db.query("select 1 from conversations")).rowCount).toBe(0);
    });
    await expect(createTenant(uid, "new@biz.test", { businessName: "Second", ownerName: "Asha" })).rejects.toThrow(/already/);
  });
});
