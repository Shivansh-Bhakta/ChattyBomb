import { notFound } from "next/navigation";
import { assistImap, assistWhatsApp, changePlan, grantPilotDays, setOverage, setTenantAlert, suspendTenant } from "@/app/actions/admin";
import { tenantDetail, topConversations } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function TenantAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const me = await requireAdmin();
  const id = z.guid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;
  const [d, top] = await Promise.all([tenantDetail(me.id, id.data), topConversations(me.id, id.data)]);
  if (!d) notFound();
  const t = d.tenant;
  const hidden = <input type="hidden" name="tenantId" value={t.id} />;
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6 text-sm">
      <h1 className="text-xl font-semibold">{t.name} <span className="text-base font-normal text-slate-500">· {t.plan} · {t.status}{t.pilot_ends_at ? ` · pilot ends ${new Date(t.pilot_ends_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}</span></h1>
      {sp.connected && <p className="text-emerald-700">{sp.connected} connected (audit-logged as assisted).</p>}
      {sp.error && <p className="text-red-600">Could not connect {sp.error}: check the values (see server log).</p>}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card"><p className="text-xs text-slate-500">Cost per resolved conversation</p><p className="text-lg font-semibold">{d.costPerResolved === null ? "—" : inr(d.costPerResolved)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Prompt-cache hit rate</p><p className="text-lg font-semibold">{d.cacheHitRate === null ? "—" : `${Math.round(d.cacheHitRate * 100)}%`}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Conversation limit · overage</p><p className="text-lg font-semibold">{t.conversation_limit} · {t.overage_policy}</p></div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-medium">Cost by channel and event (this month)</h2>
        <table className="w-full"><thead className="text-left text-slate-500"><tr><th>Channel</th><th>Event</th><th className="text-right">Quantity</th><th className="text-right">Cost</th><th /></tr></thead><tbody>
          {d.breakdown.map((b) => <tr key={`${b.channel}${b.event_type}`} className="border-t border-slate-100"><td className="py-1">{b.channel}</td><td>{b.event_type}</td><td className="text-right">{b.quantity.toLocaleString("en-IN")}</td><td className="text-right">{inr(b.cost)}</td><td className="text-xs text-red-700">{b.unpriced ? `${b.unpriced} unpriced` : ""}</td></tr>)}
        </tbody></table>
      </section>

      <section className="card">
        <h2 className="mb-2 font-medium">Most expensive conversations</h2>
        <table className="w-full"><tbody>{top.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-1">{c.contact}</td><td>{c.channel}</td><td>{c.status}</td><td className="text-right">{inr(c.cost)}</td></tr>)}</tbody></table>
      </section>

      <section className="card grid gap-3 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Controls (each one is audit-logged)</h2>
        <form action={suspendTenant}>{hidden}<input type="hidden" name="suspend" value={String(t.status !== "suspended")} />
          <button className={t.status === "suspended" ? "btn" : "rounded-md bg-red-600 px-3 py-2 text-white"}>{t.status === "suspended" ? "Unsuspend" : "Suspend (pauses AI)"}</button></form>
        <form action={grantPilotDays} className="flex gap-2">{hidden}<input name="days" type="number" min={1} max={90} defaultValue={7} className="input max-w-24" /><button className="btn-ghost">Grant pilot days</button></form>
        <form action={changePlan} className="flex gap-2">{hidden}
          <select name="plan" defaultValue={t.plan} className="input max-w-32"><option>starter</option><option>growth</option><option>scale</option></select>
          <input name="limit" type="number" min={1} placeholder="limit (scale)" className="input max-w-32" /><button className="btn-ghost">Change plan</button></form>
        <form action={setOverage} className="flex gap-2">{hidden}
          <select name="policy" defaultValue={t.overage_policy} className="input max-w-40"><option value="pause_ai">pause AI and notify</option><option value="bill_overage">bill overage</option></select><button className="btn-ghost">Set overage</button></form>
        <form action={setTenantAlert} className="flex gap-2">{hidden}<input name="inr" type="number" min={0} step="any" defaultValue={t.alert_daily_spend_inr ?? ""} placeholder="daily spend alert ₹ (blank = default)" className="input" /><button className="btn-ghost">Set alert</button></form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Channels · admin-assisted setup</h2>
        <ul>{d.channels.map((c) => <li key={c.id}>{c.type} ({c.provider}) · {c.status} · {c.external_id}{c.last_error ? ` · ${c.last_error}` : ""}</li>)}</ul>
        <details><summary className="cursor-pointer">Connect WhatsApp for this business</summary>
          <form action={assistWhatsApp} className="mt-2 grid grid-cols-2 gap-2">{hidden}
            <input name="phoneNumberId" required placeholder="Phone number ID" className="input" /><input name="displayPhone" required placeholder="+9198…" className="input" />
            <input name="wabaId" placeholder="WhatsApp Business Account ID (optional)" className="input" /><input name="accessToken" required type="password" placeholder="Permanent access token" className="input" autoComplete="off" />
            <button className="btn col-span-2">Test and save</button></form></details>
        <details><summary className="cursor-pointer">Connect email (IMAP/SMTP app password) for this business</summary>
          <form action={assistImap} className="mt-2 grid grid-cols-2 gap-2">{hidden}
            <input name="address" type="email" required placeholder="support@business.in" className="input col-span-2" />
            <input name="user" required placeholder="Login" className="input" /><input name="pass" type="password" required placeholder="App password" className="input" autoComplete="off" />
            <input name="imapHost" required placeholder="IMAP host" className="input" /><input name="imapPort" defaultValue="993" className="input" />
            <input name="smtpHost" required placeholder="SMTP host" className="input" /><input name="smtpPort" defaultValue="465" className="input" />
            <button className="btn col-span-2">Test and save</button></form></details>
        <p className="text-xs text-slate-500">Slack and Gmail need the business owner to approve OAuth: do it together on a call from their Settings → Channels.</p>
      </section>
    </main>
  );
}
