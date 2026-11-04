import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { CLOSE_HOUR, OPEN_HOUR, pilotStats, type PilotStats } from "@/lib/pilot-report";

export default async function PilotReportPage() {
  const me = await requireMember();
  const { stats, final, start, end } = await asUser(me.id, async (db) => {
    const { rows: [r] } = await db.query(`select stats, period_start, period_end from pilot_reports where tenant_id = $1`, [me.tenantId]);
    if (r) return { stats: r.stats as PilotStats, final: true, start: r.period_start as Date, end: r.period_end as Date };
    const { rows: [t] } = await db.query(`select created_at, pilot_ends_at from tenants where id = $1`, [me.tenantId]);
    return { stats: await pilotStats(db, me.tenantId, t.created_at, new Date()), final: false, start: t.created_at as Date, end: (t.pilot_ends_at ?? new Date()) as Date };
  });
  const d = (x: Date) => new Date(x).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
  const tiles: [string, string, string][] = [
    ["Leads captured", String(stats.leads_captured), "Booking and sales enquiries saved automatically"],
    ["Bookings handled", `${stats.bookings_handled} / ${stats.booking_enquiries}`, "Booking enquiries the assistant answered"],
    ["After-hours answered", `${stats.after_hours_answered} / ${stats.after_hours_messages}`, `Messages before ${OPEN_HOUR}am, after ${CLOSE_HOUR - 12}pm or on Sunday`],
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{final ? "Your pilot report" : "Pilot so far"}</h1>
      <p className="text-sm text-slate-600">{d(start)} to {d(end)}{final ? "" : " (live preview; the final report is emailed when the pilot ends)"}</p>
      <section className="grid gap-3 md:grid-cols-3">
        {tiles.map(([k, v, hint]) => <div key={k} className="card"><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-semibold">{v}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>)}
      </section>
      <p className="text-sm text-slate-600">Conversations: {stats.conversations} · AI replies: {stats.ai_replies} · handed to your team: {stats.handed_to_human}</p>
    </main>
  );
}
