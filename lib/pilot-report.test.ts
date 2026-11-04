import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, closePool } from "./db.ts";
import { mockMail } from "./mailer.ts";
import { generatePilotReport } from "./pilot-report.ts";
import { createTenant } from "./tenants.ts";
import { A_OWNER, B_OWNER, TENANT_B } from "../test/ids.ts";

afterAll(closePool);
beforeEach(() => { mockMail.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;
const CONV_B1 = "40000000-0000-0000-0000-0000000000b1", CONTACT_B1 = "30000000-0000-0000-0000-0000000000b1";
// IST wall-clock helper on a fixed past Monday.
const ist = (hhmm: string, day = "2026-10-26") => new Date(`${day}T${hhmm}:00+05:30`);

describe("missed-leads pilot report", () => {
  it("counts leads, handled bookings and answered after-hours messages, once, and emails owners", async () => {
    await q(`update tenants set created_at = '2026-10-25', pilot_ends_at = '2026-11-03' where id = $1`, [TENANT_B]);
    await q(`delete from messages where tenant_id = $1`, [TENANT_B]);
    const msg = (dir: string, sender: string, at: Date, intent: string | null = null, status = "received") =>
      q(`insert into messages (tenant_id, conversation_id, direction, sender_type, body, intent, status, created_at) values ($1, $2, $3, $4, 'x', $5, $6, $7)`,
        [TENANT_B, CONV_B1, dir, sender, intent, status, at]);
    await msg("inbound", "contact", ist("22:30"), "booking");          // after hours, booking
    await msg("outbound", "ai", ist("22:31"), null, "sent");            // answered
    await msg("inbound", "contact", ist("11:00", "2026-10-27"), "price_query"); // business hours
    await msg("inbound", "contact", ist("10:00", "2026-11-01"), "booking"); // Sunday = after hours, never answered
    await q(`insert into leads (tenant_id, contact_id, conversation_id, intent, source_channel, created_at) values ($1, $2, $3, 'booking', 'whatsapp', $4)`, [TENANT_B, CONTACT_B1, CONV_B1, ist("22:30")]);

    expect(await generatePilotReport(TENANT_B)).toBe(true);
    expect(await generatePilotReport(TENANT_B)).toBe(false); // once
    const [r] = await q(`select stats from pilot_reports where tenant_id = $1`, [TENANT_B]);
    expect(r.stats).toMatchObject({ leads_captured: 1, booking_enquiries: 2, bookings_handled: 1, after_hours_messages: 2, after_hours_answered: 1 });
    expect(mockMail).toEqual([expect.objectContaining({ to: "owner@glow.test", text: expect.stringContaining("Leads captured: 1") })]);
  });

  it("is visible to the tenant only", async () => {
    expect((await asUser(B_OWNER, (db) => db.query(`select 1 from pilot_reports`))).rowCount).toBe(1);
    expect((await asUser(A_OWNER, (db) => db.query(`select 1 from pilot_reports`))).rowCount).toBe(0);
  });
});

describe("landing page signup source", () => {
  it("stores a clean ref and drops anything unexpected", async () => {
    const mk = async (email: string, ref: string) => {
      const uid = (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
      const id = await createTenant(uid, email, { businessName: "Ref Biz", ownerName: "R", ref });
      return (await q(`select signup_source from tenants where id = $1`, [id]))[0].signup_source;
    };
    expect(await mk("ref1@x.test", "Landing")).toBe("landing");
    expect(await mk("ref2@x.test", "<script>")).toBeNull();
  });
});
