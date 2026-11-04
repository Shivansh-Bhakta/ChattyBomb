import Link from "next/link";
import { addRate, saveAlerts } from "@/app/actions/admin";
import { BarChart } from "@/components/bar-chart";
import { currentRates, dailyTrend, overview, RATE_UNITS, tenantMetrics, topConversations, unknownSends } from "@/lib/admin";
import { getAlertSettings } from "@/lib/alerts";
import { requireAdmin } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { unpricedSummary } from "@/lib/metering";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const BLUE = "#2a78d6", ORANGE = "#eb6834";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireAdmin();
  const { error } = await searchParams;
  const [rows, trend, top, rates, stuck, unpriced, alerts] = await Promise.all([
    tenantMetrics(me.id), dailyTrend(me.id), topConversations(me.id, null), currentRates(me.id), unknownSends(me.id),
    asUser(me.id, (db) => unpricedSummary(db)), // audit rows with tenant_id null: visible to platform admins only
    asService((db) => getAlertSettings(db)), // scope: platform-admin (requireAdmin above)
  ]);
  const o = overview(rows);
  const tiles: [string, string][] = [
    ["MRR", inr(o.mrr)], ["Active tenants", `${o.activeTenants} (+${o.pilots} pilots)`], ["Conversations this month", String(o.conversations)],
    ["AI cost (est.)", inr(o.aiCost)], ["Meta fees (est.)", inr(o.metaFees)], ["Gross margin", pct(o.marginPct)],
  ];
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tiles.map(([k, v]) => <div key={k} className="card p-4"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-semibold">{v}</p></div>)}
      </section>
      <p className="text-xs text-slate-500">Costs are estimates (usage × the rates table). Reconcile monthly against the actual Anthropic, Voyage and Meta invoices; if they differ, add a corrected rate (new effective date) and treat past months as estimates.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <BarChart title="Daily cost, last 30 days (IST)" rows={trend} format={inr} series={[{ key: "ai_cost", label: "AI", color: BLUE }, { key: "meta_fees", label: "Meta fees", color: ORANGE }]} />
        <BarChart title="Conversations per day" rows={trend} format={(n) => String(Math.round(n))} series={[{ key: "conversations", label: "Conversations", color: BLUE }]} />
      </div>

      {(unpriced.total > 0 || stuck.length > 0) && (
        <section className="card space-y-2 border-red-300 bg-red-50 text-sm">
          {unpriced.total > 0 && <p><b>Unpriced usage (30 days): {unpriced.total}</b>: {unpriced.byRateKey.map((r) => `${r.rate_key} ×${r.events}`).join(", ")}. Add these rates below.</p>}
          {stuck.length > 0 && <p><b>{stuck.length} sends with unknown outcome</b> (older than 10 min): check the provider, then tell the tenant. {stuck.slice(0, 5).map((s) => `${s.tenant}: “${String(s.body).slice(0, 40)}”`).join(" · ")}</p>}
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="p-3">Tenant</th><th>Plan</th><th>Status</th><th>Conversations</th><th>AI cost</th><th>Meta fees</th><th>Revenue</th><th>Margin</th><th>Flags</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3"><Link className="underline" href={`/admin/tenants/${r.id}`}>{r.name}</Link></td>
                <td className="capitalize">{r.plan}</td><td>{r.status}</td>
                <td>{r.conversations} / {r.conversation_limit}</td><td>{inr(r.ai_cost)}</td><td>{inr(r.meta_fees)}</td><td>{inr(r.revenue)}</td>
                <td className={r.negative_margin ? "font-semibold text-red-700" : ""}>{inr(r.margin)} ({pct(r.margin_pct)})</td>
                <td className="space-x-1 text-xs">
                  {r.negative_margin && <span className="rounded bg-red-100 px-1 text-red-800">⚠ negative margin</span>}
                  {r.near_limit && <span className="rounded bg-amber-100 px-1 text-amber-900">⚠ ≥80% of limit</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">Top 20 most expensive conversations (this month)</h2>
        <table className="w-full text-sm"><tbody>
          {top.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-1">{c.tenant}</td><td>{c.contact}</td><td>{c.channel}</td><td>{c.status}</td><td className="text-right">{inr(c.cost)}</td></tr>)}
          {top.length === 0 && <tr><td className="text-slate-500">No costs yet this month.</td></tr>}
        </tbody></table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <h2 className="font-medium">Rates (current)</h2>
          {error === "rate" && <p className="text-red-600">Rate not saved: check key, value and unit.</p>}
          <div className="max-h-64 overflow-y-auto"><table className="w-full"><tbody>
            {rates.map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="py-1 font-mono text-xs">{r.key}</td><td className="text-right">{r.value} {r.currency}</td><td className="text-xs text-slate-500">{r.unit}</td></tr>)}
          </tbody></table></div>
          <form action={addRate} className="grid grid-cols-2 gap-2">
            <input name="key" required placeholder="anthropic:claude-sonnet-5-5:input_per_mtok" className="input col-span-2 font-mono text-xs" />
            <input name="value" required type="number" step="any" min="0" placeholder="value" className="input" />
            <select name="currency" className="input"><option>USD</option><option>INR</option></select>
            <select name="unit" className="input">{RATE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
            <input name="effectiveFrom" type="datetime-local" className="input" title="Effective from (default: now)" />
            <input name="note" placeholder="note (source of price)" className="input col-span-2" />
            <button className="btn col-span-2">Add rate (history is kept)</button>
          </form>
        </section>
        <section className="card space-y-2 text-sm">
          <h2 className="font-medium">Spend alerts (email)</h2>
          {error === "alerts" && <p className="text-red-600">Alerts not saved: check the email and amounts.</p>}
          <form action={saveAlerts} className="space-y-2">
            <input name="email" type="email" defaultValue={alerts.email} placeholder="you@chattybomb.in" className="input" />
            <label className="block">Daily total AI spend above (₹)<input name="dailyAiSpendInr" type="number" min="0" step="any" defaultValue={alerts.dailyAiSpendInr} className="input" /></label>
            <label className="block">Any tenant&apos;s daily spend above (₹, default)<input name="tenantDailySpendInr" type="number" min="0" step="any" defaultValue={alerts.tenantDailySpendInr} className="input" /></label>
            <button className="btn">Save alerts</button>
          </form>
          <p className="text-xs text-slate-500">Checked every 15 minutes; each alert is emailed at most once per day. Per-tenant thresholds can be set on the tenant page.</p>
        </section>
      </div>
    </main>
  );
}
