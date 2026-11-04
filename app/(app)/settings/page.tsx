import Link from "next/link";
import { saveBillingDetails, subscribe } from "@/app/actions/billing";
import { deleteMyTenant } from "@/app/actions/tenant";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { usageSummary } from "@/lib/usage";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireMember();
  const { error, subscribed } = await searchParams;
  const [u, billing] = await asUser(me.id, async (db) => [
    await usageSummary(db, me.tenantId),
    {
      tenant: (await db.query(`select billing_name, billing_address, gstin from tenants where id = $1`, [me.tenantId])).rows[0],
      sub: (await db.query(`select plan, status, amount_paise, current_period_end from subscriptions where status in ('created','active','halted') order by created_at desc limit 1`)).rows[0],
      invoices: (await db.query(`select id, number, period_start, total_paise, status from invoices order by period_start desc limit 24`)).rows,
    },
  ] as const);
  const owner = me.role === "owner";
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Settings · {u.name}</h1>
      <nav className="flex gap-4 text-sm underline"><Link href="/settings/channels">Channels</Link><Link href="/settings/pilot-report">Pilot report</Link>{owner && <Link href="/settings/audit">Audit log</Link>}</nav>

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

      <section className="card space-y-3">
        <h2 className="font-medium">Billing</h2>
        {subscribed && <p className="text-sm text-emerald-700">Subscription active. Thank you!</p>}
        {error === "subscribe" && <p className="text-sm text-red-600">Could not start the subscription. Please try again.</p>}
        {billing.sub ? (
          <p className="text-sm">Subscription: <b className="capitalize">{billing.sub.plan}</b> · {billing.sub.status} · ₹{(billing.sub.amount_paise / 100).toLocaleString("en-IN")}/month + GST
            {billing.sub.current_period_end && ` · renews ${new Date(billing.sub.current_period_end).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}`}</p>
        ) : owner ? (
          <form action={subscribe} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{u.status === "suspended" ? "Your pilot has ended. Choose a plan to resume AI replies:" : "Choose a plan (UPI autopay or card):"}</span>
            <button name="plan" value="starter" className="btn-ghost">Starter: ₹999/mo · 500 conversations</button>
            <button name="plan" value="growth" className="btn">Growth: ₹2,999/mo · 2,000 conversations</button>
            <span className="text-xs text-slate-500">Prices exclude 18% GST. Scale (multi-branch): contact us.</span>
          </form>
        ) : <p className="text-sm text-slate-500">No subscription yet (the owner can subscribe).</p>}
        {owner && (
          <form action={saveBillingDetails} className="grid gap-2 text-sm md:grid-cols-3">
            <input name="billing_name" required defaultValue={billing.tenant?.billing_name ?? ""} placeholder="Legal name for invoices" className="input" />
            <input name="gstin" defaultValue={billing.tenant?.gstin ?? ""} placeholder="GSTIN (optional)" className="input" />
            <input name="billing_address" required defaultValue={billing.tenant?.billing_address ?? ""} placeholder="Billing address" className="input" />
            {error === "billing" && <p className="text-red-600 md:col-span-3">Check the name, address and GSTIN format.</p>}
            <button className="btn-ghost md:col-span-3">Save billing details</button>
          </form>
        )}
        {billing.invoices.length > 0 && (
          <table className="w-full text-sm"><tbody>{billing.invoices.map((i) => (
            <tr key={i.id} className="border-t border-slate-100"><td className="py-1"><Link className="underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
              <td>{new Date(i.period_start).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" })}</td>
              <td className="text-right">₹{(i.total_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td className="pl-3">{i.status}</td></tr>))}</tbody></table>
        )}
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
