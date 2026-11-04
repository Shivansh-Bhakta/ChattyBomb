import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

export default async function AuditPage() {
  const me = await requireMember();
  if (me.role !== "owner") notFound();
  const rows = await asUser(me.id, async (db) => (await db.query(
    `select a.created_at, a.actor_type, u.name as actor, a.action, a.target_type, a.metadata
       from audit_log a left join users u on u.id = a.actor_user_id order by a.created_at desc limit 300`)).rows);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <p className="text-sm text-slate-600">Every AI reply, handoff, human override and settings change. Latest 300.</p>
      <table className="card w-full p-0 text-sm">
        <thead className="text-left text-slate-500"><tr><th className="p-3">When (IST)</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap p-3">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
              <td>{r.actor ?? r.actor_type}</td><td>{r.action}</td>
              <td className="max-w-md truncate font-mono text-xs text-slate-500">{JSON.stringify(r.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
