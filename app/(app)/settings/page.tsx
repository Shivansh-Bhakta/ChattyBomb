import Link from "next/link";
import { deleteMyTenant } from "@/app/actions/tenant";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { usageSummary } from "@/lib/usage";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireMember();
  const { error } = await searchParams;
  const u = await asUser(me.id, (db) => usageSummary(db, me.tenantId));
  const owner = me.role === "owner";
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Settings · {u.name}</h1>
      <nav className="flex gap-4 text-sm underline"><Link href="/settings/channels">Channels</Link>{owner && <Link href="/settings/audit">Audit log</Link>}</nav>

      <section className="card space-y-3">
        <h2 className="font-medium">Plan and usage</h2>
        <p className="text-sm">Plan: <b className="capitalize">{u.plan}</b> · Status: {u.status}
          {u.pilot_ends_at && ` · Pilot ends ${new Date(u.pilot_ends_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}`}</p>
        <div>
          <p className="text-sm">Conversations this month: <b>{u.used}</b> of {u.limit} ({u.pct}%)</p>
          <div className="mt-1 h-2 rounded bg-slate-100"><div className={`h-2 rounded ${u.over ? "bg-red-500" : u.warn ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, u.pct)}%` }} /></div>
        </div>
        <p className="text-sm text-slate-600">By channel: {u.byChannel.length ? u.byChannel.map((c: { channel: string; conversations: number }) => `${c.channel} ${c.conversations}`).join(" · ") : "none yet"}</p>
        <p className="text-sm text-slate-600">When the limit is reached: {u.overage_policy === "pause_ai" ? "AI replies pause (your team can still reply)" : "extra conversations are billed as overage"}. Contact us to change plan.</p>
      </section>

      {owner && (
        <section className="card space-y-2 border-red-200">
          <h2 className="font-medium text-red-700">Delete business and all data</h2>
          <p className="text-sm text-slate-600">Permanently deletes conversations, contacts, documents, leads, reminders, channel connections, team logins and usage history. This cannot be undone.</p>
          {error === "delete" && <p className="text-sm text-red-600">Type the business name exactly to confirm.</p>}
          <form action={deleteMyTenant} className="flex gap-2">
            <input name="confirm" required placeholder={`Type "${u.name}" to confirm`} className="input" autoComplete="off" />
            <button className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">Delete</button>
          </form>
        </section>
      )}
    </main>
  );
}
