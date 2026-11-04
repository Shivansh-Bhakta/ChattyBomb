import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { mockOutbox } from "./channels/mock.ts";
import { asService, asUser, closePool } from "./db.ts";
import { createReminder, sendDueReminders } from "./reminders.ts";
import { A_AGENT, B_OWNER, CONV_A1, TENANT_A } from "../test/ids.ts";
import { waMessage, waRequest } from "../test/whatsapp.ts";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const at = (minutesFromNow: number) => {
  const d = new Date(Date.now() + minutesFromNow * 60_000 + 5.5 * 3600_000); // as IST wall clock
  return d.toISOString().slice(0, 16);
};

describe("leads", () => {
  it("saves one lead per conversation for booking and sales enquiries", async () => {
    await POST(waRequest(waMessage("wamid.l1", "919200000001", "I want to book an appointment tomorrow", "mock-phone-sunrise", "Vikram")));
    await POST(waRequest(waMessage("wamid.l2", "919200000001", "Is there any slot at 5pm for the appointment?", "mock-phone-sunrise", "Vikram")));
    const leads = await q(`select name, phone, intent, source_channel from leads where phone = '+919200000001'`);
    expect(leads).toEqual([{ name: "Vikram", phone: "+919200000001", intent: "booking", source_channel: "whatsapp" }]);
  });
});

describe("reminders", () => {
  it("only lets a member create reminders on their own tenant's conversations", async () => {
    await expect(asUser(B_OWNER, (db) => createReminder(db, B_OWNER, { conversationId: CONV_A1, type: "callback", dueAt: at(5), message: "hi" }))).rejects.toThrow(/not found/);
    await expect(asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "callback", dueAt: at(5) }))).rejects.toThrow(/message or a template/);
  });

  it("sends due reminders exactly once inside the window, and skips future/cancelled ones", async () => {
    const due = await asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "callback", dueAt: at(-1), message: "Calling you back at 5pm" }));
    await asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "follow_up", dueAt: at(60), message: "later" }));
    const cancelled = await asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "renewal", dueAt: at(-2), message: "x" }));
    await q(`update reminders set status = 'cancelled' where id = $1`, [cancelled]);

    const [a, b] = await Promise.all([sendDueReminders(), sendDueReminders()]);
    expect(a.sent + b.sent).toBe(1);
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].msg).toEqual({ kind: "text", text: "Calling you back at 5pm" });
    expect((await q("select status from reminders where id = $1", [due]))[0].status).toBe("sent");
  });

  it("uses the approved template outside the 24h window, and fails visibly without one", async () => {
    await q(`update conversations set last_inbound_at = now() - interval '2 days' where id = $1`, [CONV_A1]);
    await q(`update channels set config = config || '{"templates":[{"name":"appointment_reminder","language":"en","category":"utility"}]}' where id = '20000000-0000-0000-0000-00000000000a'`);
    const withT = await asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "appointment", dueAt: at(-1), message: "See you at 5", templateName: "appointment_reminder" }));
    const without = await asUser(A_AGENT, (db) => createReminder(db, A_AGENT, { conversationId: CONV_A1, type: "renewal", dueAt: at(-1), message: "Renew?" }));
    await sendDueReminders();
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].msg).toMatchObject({ kind: "template", name: "appointment_reminder", category: "utility", params: ["Rahul Sharma"] });
    expect(await q("select status, error from reminders where id = $1", [without])).toEqual([{ status: "failed", error: "24-hour window closed and no approved template set" }]);
    expect((await q("select status from reminders where id = $1", [withT]))[0].status).toBe("sent");
    const [u] = await q(`select event_type from usage_events where tenant_id = $1 and event_type = 'wa_template_message'`, [TENANT_A]);
    expect(u).toBeTruthy();
  });
});
