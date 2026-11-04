import Link from "next/link";
import { setLeadStatus } from "@/app/actions/followups";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

export default async function LeadsPage() {
  const me = await requireMember();
  const leads = await asUser(me.id, async (db) => (await db.query(
    `select id, name, phone, email, intent, source_channel, status, conversation_id, created_at from leads order by created_at desc limit 200`)).rows);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Leads</h1>
      <table className="card w-full p-0 text-sm">
        <thead className="text-left text-slate-500"><tr><th className="p-3">Name</th><th>Contact</th><th>Intent</th><th>Channel</th><th>Captured</th><th>Status</th></tr></thead>
        <tbody>
          {leads.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-500">No leads yet. Booking and sales enquiries are saved here automatically.</td></tr>}
          {leads.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="p-3">{l.conversation_id ? <Link className="underline" href={`/inbox?c=${l.conversation_id}`}>{l.name || "(no name)"}</Link> : l.name}</td>
              <td>{l.phone ?? l.email}</td><td>{l.intent.replace("_", " ")}</td><td>{l.source_channel}</td>
              <td>{new Date(l.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              <td>
                <form action={setLeadStatus} className="flex gap-1">
                  <input type="hidden" name="leadId" value={l.id} />
                  <select name="status" defaultValue={l.status} className="input py-1">{["new", "contacted", "won", "lost"].map((s) => <option key={s}>{s}</option>)}</select>
                  <button className="btn-ghost py-1">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
