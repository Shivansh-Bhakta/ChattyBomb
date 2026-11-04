import Link from "next/link";
import { cancelReminder } from "@/app/actions/followups";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

export default async function RemindersPage() {
  const me = await requireMember();
  const rows = await asUser(me.id, async (db) => (await db.query(
    `select r.id, r.type, r.due_at, r.status, r.message, r.template_name, r.error, r.conversation_id, ct.name
       from reminders r join contacts ct on ct.id = r.contact_id order by (r.status = 'scheduled') desc, r.due_at limit 200`)).rows);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Reminders and follow-ups</h1>
      <p className="text-sm text-slate-600">Create them from a conversation. Due reminders are sent every 5 minutes; outside WhatsApp&apos;s 24-hour window the chosen approved template is used.</p>
      <ul className="card divide-y divide-slate-100 p-0 text-sm">
        {rows.length === 0 && <li className="p-4 text-slate-500">No reminders.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-4">
            <div className="mr-auto">
              <p><span className="font-medium">{r.type.replace("_", " ")}</span> · {r.conversation_id ? <Link className="underline" href={`/inbox?c=${r.conversation_id}`}>{r.name || "contact"}</Link> : r.name} · {new Date(r.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
              <p className="text-slate-500">{r.message || `template: ${r.template_name}`} · <span className={r.status === "failed" ? "text-red-600" : ""}>{r.status}{r.error ? `: ${r.error}` : ""}</span></p>
            </div>
            {r.status === "scheduled" && (
              <form action={cancelReminder}><input type="hidden" name="reminderId" value={r.id} /><button className="btn-ghost">Cancel</button></form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
