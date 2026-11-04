import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
import { asService, closePool } from "../db.ts";
import { mockOutbox } from "./mock.ts";
import { sendMessage, WindowClosedError } from "./outbound.ts";
import { verifySignature, whatsapp } from "./whatsapp.ts";
import { TENANT_A, TENANT_B } from "../../test/ids.ts";
import { waMessage, waRequest, waStatus } from "../../test/whatsapp.ts";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });

const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;

describe("WhatsApp webhook signature", () => {
  const body = '{"a":1}';
  const sig = (s: string) => "sha256=" + createHmac("sha256", s).update(body).digest("hex");

  it("accepts a valid X-Hub-Signature-256 and rejects wrong, missing or malformed ones", () => {
    expect(verifySignature(body, sig("k"), "k")).toBe(true);
    expect(verifySignature(body, sig("other"), "k")).toBe(false);
    expect(verifySignature(body + " ", sig("k"), "k")).toBe(false);
    expect(verifySignature(body, null, "k")).toBe(false);
    expect(verifySignature(body, "sha256=abcd", "k")).toBe(false);
    expect(verifySignature(body, sig("k").replace("sha256=", "sha1="), "k")).toBe(false);
  });

  it("route returns 401 and stores nothing for a bad signature", async () => {
    const res = await POST(waRequest(waMessage("wamid.bad", "919000000001", "hi"), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(await q("select 1 from messages where provider_message_id = 'wamid.bad'")).toHaveLength(0);
  });

  it("route returns 400 for a signed but malformed payload", async () => {
    expect((await POST(waRequest({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {} }] }] }))).status).toBe(400);
  });

  it("verification handshake checks the verify token", async () => {
    const ok = await GET(new Request("http://x/?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=42"));
    expect([ok.status, await ok.text()]).toEqual([200, "42"]);
    expect((await GET(new Request("http://x/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"))).status).toBe(403);
  });
});

describe("WhatsApp inbound", () => {
  it("ignores a duplicate webhook delivery of the same message", async () => {
    const body = waMessage("wamid.dup1", "919000000002", "Do you open on Sunday?", "mock-phone-sunrise", "Asha");
    expect((await POST(waRequest(body))).status).toBe(200);
    expect((await POST(waRequest(body))).status).toBe(200);
    const msgs = await q("select conversation_id from messages where provider_message_id = 'wamid.dup1'");
    expect(msgs).toHaveLength(1);
    const [conv] = await q("select tenant_id, unread_count, status from conversations where id = $1", [msgs[0].conversation_id]);
    expect(conv).toMatchObject({ tenant_id: TENANT_A, unread_count: 1 });
    const billed = await q("select count(*)::int as n from usage_events where conversation_id = $1 and event_type = 'conversation_billed'", [msgs[0].conversation_id]);
    expect(billed[0].n).toBe(1);
  });

  it("routes by phone_number_id and merges contacts on phone", async () => {
    await POST(waRequest(waMessage("wamid.b1", "919833333333", "Kal slot hai?", "mock-phone-glow")));
    const [m] = await q(`select m.tenant_id, c.contact_id from messages m join conversations c on c.id = m.conversation_id where provider_message_id = 'wamid.b1'`);
    expect(m.tenant_id).toBe(TENANT_B);
    expect(m.contact_id).toBe("30000000-0000-0000-0000-0000000000b1"); // seeded Kavya Rao
    await POST(waRequest(waMessage("wamid.x", "919000000003", "hi", "unknown-phone-id")));
    expect(await q("select 1 from messages where provider_message_id = 'wamid.x'")).toHaveLength(0);
  });
});

describe("WhatsApp 24-hour window", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

  it("allows free-form replies only within 24h of the last inbound message", () => {
    expect(whatsapp.canSendFreeform({ last_inbound_at: ago(23.99) }, now)).toBe(true);
    expect(whatsapp.canSendFreeform({ last_inbound_at: ago(24) }, now)).toBe(false);
    expect(whatsapp.canSendFreeform({ last_inbound_at: ago(30) }, now)).toBe(false);
    expect(whatsapp.canSendFreeform({ last_inbound_at: null }, now)).toBe(false);
  });

  it("refuses a free-form send outside the window but allows a template, and meters both correctly", async () => {
    const [conv] = await q(`insert into conversations (tenant_id, channel_id, contact_id, external_thread_id, last_inbound_at)
      values ($1, '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1', 'old-thread', now() - interval '25 hours') returning id`, [TENANT_A]);
    await expect(sendMessage(TENANT_A, conv.id, { kind: "text", text: "hello" }, { type: "ai" })).rejects.toBeInstanceOf(WindowClosedError);
    expect(mockOutbox).toHaveLength(0);
    expect(await q("select 1 from messages where conversation_id = $1", [conv.id])).toHaveLength(0);

    await sendMessage(TENANT_A, conv.id, { kind: "template", name: "follow_up", language: "en", category: "utility", params: ["Rahul"] }, { type: "system" });
    expect(mockOutbox).toHaveLength(1);
    const [usage] = await q("select event_type, total_cost_inr::float as cost from usage_events where conversation_id = $1", [conv.id]);
    expect(usage).toMatchObject({ event_type: "wa_template_message", cost: 0.12 });
  });

  it("sends inside the window, then applies delivery statuses without downgrading", async () => {
    const [conv] = await q("select id from conversations where id = '40000000-0000-0000-0000-0000000000a1'");
    const { providerMessageId, messageId } = await sendMessage(TENANT_A, conv.id, { kind: "text", text: "We open 9-1 on Sunday." }, { type: "ai" });
    await POST(waRequest(waStatus(providerMessageId!, "read")));
    await POST(waRequest(waStatus(providerMessageId!, "delivered")));
    expect((await q("select status from messages where id = $1", [messageId]))[0].status).toBe("read");
    // Status for the same message id reported on another tenant's number changes nothing.
    await POST(waRequest(waStatus(providerMessageId!, "failed", "mock-phone-glow")));
    expect((await q("select status from messages where id = $1", [messageId]))[0].status).toBe("read");
  });

  it("rejects sending into another tenant's conversation", async () => {
    await expect(sendMessage(TENANT_B, "40000000-0000-0000-0000-0000000000a1", { kind: "text", text: "x" }, { type: "ai" })).rejects.toThrow(/not found/);
  });
});
