import { afterAll, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { sweepUnknownSends, testChannel } from "./channels/test-connection.ts";
import { encrypt } from "./crypto.ts";
import { asService, closePool } from "./db.ts";
import { redact, reportError } from "./monitoring.ts";
import { A_OWNER, CHANNEL_A, CONV_A1, TENANT_A } from "../test/ids.ts";

afterAll(closePool);
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;

describe("error monitoring", () => {
  it("redacts secrets and never includes them in the report", async () => {
    expect(redact("key sk-ant-api03-abc_DEF-123 and xoxb-1-2-abc and Bearer abc.def and postgres://u:pw@db/x and token=s3cr3t&x=1"))
      .toBe("key [redacted] and [redacted] and [redacted] and [redacted]db/x and token=[redacted]&x=1");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = await reportError(new Error("WhatsApp failed with EAAGsecretsecret123 for postgres://admin:pw@host/db"), { path: "/api/webhooks/whatsapp?x=1", method: "POST" });
    expect(JSON.stringify(event)).not.toMatch(/EAAGsecret|admin:pw/);
    expect(event.path).toBe("/api/webhooks/whatsapp");
    expect(err).toHaveBeenCalledWith(expect.stringContaining('"level":"error"'));
    err.mockRestore();
  });
});

describe("health check", () => {
  it("reports ok when the database answers", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("channel test connection", () => {
  it("marks a working channel connected and a broken one error, audit-logged", async () => {
    expect(await testChannel(TENANT_A, CHANNEL_A, { id: A_OWNER, type: "user" })).toEqual({ ok: true, error: null });
    const [bad] = await q(`insert into channels (tenant_id, type, provider, status, external_id, credentials_encrypted) values ($1, 'email', 'imap', 'connected', 'broken@x.test', $2) returning id`, [TENANT_A, encrypt("{}")]);
    const r = await testChannel(TENANT_A, bad.id, { id: A_OWNER, type: "user" });
    expect(r.ok).toBe(false);
    expect((await q(`select status, last_error is not null as has_error from channels where id = $1`, [bad.id]))[0]).toEqual({ status: "error", has_error: true });
    await expect(testChannel("10000000-0000-0000-0000-00000000000b", CHANNEL_A, { id: A_OWNER, type: "user" })).rejects.toThrow(/not found/);
    expect((await q(`select count(*)::int as n from audit_log where action = 'channel.test'`))[0].n).toBe(2);
  });
});

describe("unknown-outcome sweep", () => {
  it("hands the conversation to a human once", async () => {
    await q(`insert into messages (tenant_id, conversation_id, direction, sender_type, body, status, created_at) values ($1, $2, 'outbound', 'ai', 'maybe sent', 'sending', now() - interval '20 minutes')`, [TENANT_A, CONV_A1]);
    expect(await sweepUnknownSends()).toBe(1);
    expect((await q(`select status from conversations where id = $1`, [CONV_A1]))[0].status).toBe("needs_human");
    await q(`update conversations set status = 'open' where id = $1`, [CONV_A1]);
    expect(await sweepUnknownSends()).toBe(0);
  });
});
