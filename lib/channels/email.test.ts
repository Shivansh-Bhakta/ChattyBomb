import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ingestDocument } from "../ai/documents.ts";
import { decrypt } from "../crypto.ts";
import { asService, closePool } from "../db.ts";
import { parseEmail, stripQuoted } from "./email.ts";
import { saveEmailChannel } from "./email-connect.ts";
import { pollEmail } from "./email-poll.ts";
import { mockInbox, mockOutbox } from "./mock.ts";
import "../ai/pipeline.ts";
import { A_OWNER, B_OWNER, TENANT_A, TENANT_B } from "../../test/ids.ts";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const ADDR = "frontdesk@sunrise.test";

const raw = (o: { id: string; from?: string; subject?: string; body: string; inReplyTo?: string; refs?: string; extra?: string }) =>
  [`From: ${o.from ?? "Meera Nair <meera@example.com>"}`, `To: ${ADDR}`, `Subject: ${o.subject ?? "Fees"}`, `Message-ID: ${o.id}`,
   o.inReplyTo && `In-Reply-To: ${o.inReplyTo}`, o.refs && `References: ${o.refs}`, o.extra, "Content-Type: text/plain; charset=utf-8", "", o.body]
    .filter((l) => l !== undefined).join("\r\n");

describe("email parsing", () => {
  it("threads on the References root, then In-Reply-To, then its own Message-ID", async () => {
    expect((await parseEmail(raw({ id: "<a@x>", body: "hi" }), ADDR))!.threadId).toBe("<a@x>");
    expect((await parseEmail(raw({ id: "<b@x>", body: "hi", inReplyTo: "<a@x>" }), ADDR))!.threadId).toBe("<a@x>");
    expect((await parseEmail(raw({ id: "<c@x>", body: "hi", inReplyTo: "<b@x>", refs: "<a@x> <b@x>" }), ADDR))!.threadId).toBe("<a@x>");
  });

  it("ignores our own mail, auto-replies and mailing lists (no reply loops)", async () => {
    expect(await parseEmail(raw({ id: "<d@x>", from: ADDR, body: "x" }), ADDR)).toBeNull();
    expect(await parseEmail(raw({ id: "<e@x>", body: "Out of office", extra: "Auto-Submitted: auto-replied" }), ADDR)).toBeNull();
    expect(await parseEmail(raw({ id: "<f@x>", body: "news", extra: "List-Id: <news.example.com>" }), ADDR)).toBeNull();
    expect(await parseEmail(raw({ id: "<g@x>", body: "x", extra: "Precedence: bulk" }), ADDR)).toBeNull();
  });

  it("strips quoted history and keeps the subject", async () => {
    expect(stripQuoted("Thanks!\n\nOn Mon, 3 Nov 2026 Sunrise wrote:\n> old text")).toBe("Thanks!");
    const m = await parseEmail(raw({ id: "<h@x>", subject: "CBC test", body: "How much?\n> quoted" }), ADDR);
    expect(m!.body).toBe("Subject: CBC test\n\nHow much?");
    expect(m!.from).toEqual({ email: "meera@example.com", name: "Meera Nair" });
  });
});

describe("email channel end to end (mock mailbox)", () => {
  let channelId: string;
  beforeAll(async () => {
    channelId = await saveEmailChannel(TENANT_A, A_OWNER, "imap", ADDR, { user: ADDR, pass: "app-pass-123", imap: { host: "imap.x", port: 993, secure: true }, smtp: { host: "smtp.x", port: 465, secure: true } });
    const bytes = new TextEncoder().encode(readFileSync(new URL("../../test/fixtures/sunrise-clinic.md", import.meta.url), "utf8"));
    await ingestDocument(TENANT_A, A_OWNER, { name: "faq.md", type: "text/markdown", bytes });
  });

  it("stores the app password encrypted and refuses the same address for another tenant", async () => {
    const [ch] = await q("select credentials_encrypted from channels where id = $1", [channelId]);
    expect(ch.credentials_encrypted).not.toContain("app-pass-123");
    expect(JSON.parse(decrypt(ch.credentials_encrypted)).pass).toBe("app-pass-123");
    await expect(saveEmailChannel(TENANT_B, B_OWNER, "imap", ADDR, {})).rejects.toThrow(/another business/);
  });

  it("polls, answers by email in the same thread, merges the contact, and ignores re-delivery", async () => {
    await q(`update contacts set email = 'meera@example.com' where id = '30000000-0000-0000-0000-0000000000a1'`); // known WhatsApp contact
    mockInbox.set(ADDR, [raw({ id: "<m1@example.com>", subject: "CBC test", body: "What is the price of a CBC test?" })]);
    expect(await pollEmail(channelId)).toEqual({ ingested: 1 });
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0]).toMatchObject({ channel: "email", target: { to: "meera@example.com", threadId: "<m1@example.com>" } });
    const [conv] = await q(`select contact_id from conversations where external_thread_id = '<m1@example.com>'`);
    expect(conv.contact_id).toBe("30000000-0000-0000-0000-0000000000a1");

    mockInbox.set(ADDR, [
      raw({ id: "<m1@example.com>", body: "duplicate" }),
      raw({ id: "<m2@example.com>", subject: "Re: CBC test", body: "Thanks", inReplyTo: "<m1@example.com>", refs: "<m1@example.com>" }),
    ]);
    expect(await pollEmail(channelId)).toEqual({ ingested: 1 });
    expect(await q(`select 1 from conversations where external_thread_id = '<m1@example.com>'`)).toHaveLength(1);
    expect(await q(`select 1 from messages where email_message_id in ('<m1@example.com>', '<m2@example.com>')`)).toHaveLength(2);
  });
});

describe("email loop guards", () => {
  it("never accepts mail from no-reply, bounce or postmaster senders", async () => {
    for (const from of ["noreply@shop.com", "no-reply@shop.com", "No-Reply+abc@shop.com", "donotreply@bank.in", "do-not-reply@x.com", "MAILER-DAEMON@mx.google.com", "postmaster@x.com", "Bounce <mailer-daemon@x.com>"]) {
      expect(await parseEmail(raw({ id: `<${from}@t>`, from, body: "hi" }), ADDR), from).toBeNull();
    }
    expect(await parseEmail(raw({ id: "<ok@t>", from: "noreplyhelp-desk@x.com", body: "hi" }), ADDR)).not.toBeNull(); // only exact machine names
  });

  it("caps AI replies per sender per day, then hands the thread to a human", async () => {
    const [ch] = await q(`select id from channels where external_id = $1`, [ADDR]);
    const sender = "loop@autoresponder.test";
    for (let i = 0; i < 7; i++) {
      mockInbox.set(ADDR, [raw({ id: `<loop${i}@t>`, from: sender, subject: "CBC test price", body: "What is the price of a CBC test?" })]);
      await pollEmail(ch.id);
    }
    expect(mockOutbox.filter((o) => o.target.to === sender)).toHaveLength(5); // default AI_EMAIL_DAILY_REPLY_CAP
    const handoffs = await q(`select a.metadata->>'reason' as reason from audit_log a where a.action = 'ai.handoff' and a.metadata->>'reason' = 'email_daily_cap'`);
    expect(handoffs.length).toBeGreaterThanOrEqual(1);
  });
});
