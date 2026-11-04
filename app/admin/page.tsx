import { notFound, redirect } from "next/navigation";
import { authUser, getMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { unpricedSummary } from "@/lib/metering";

// shortcut: placeholder until the platform owner console (M10); only the unpriced-usage warning lives here.
export default async function AdminPage() {
  const u = await authUser();
  if (!u) redirect("/login");
  if ((await getMember(u.id))?.role !== "platform_admin") notFound();
  // Runs as the admin under RLS: audit_log rows with tenant_id null are visible only to platform admins.
  const unpriced = await asUser(u.id, (db) => unpricedSummary(db));
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Platform owner console</h1>
      <section className={`card ${unpriced.total ? "border-red-300 bg-red-50" : ""}`}>
        <h2 className="font-medium">Unpriced usage (last 30 days): {unpriced.total}</h2>
        {unpriced.total ? (
          <ul className="mt-2 text-sm">{unpriced.byRateKey.map((r) => <li key={r.rate_key}><code>{r.rate_key}</code>: {r.events} events: add this rate, then re-price.</li>)}</ul>
        ) : <p className="text-sm text-slate-600">Every billable event had a rate.</p>}
      </section>
      <p className="text-slate-500">The rest of the console arrives in M10.</p>
    </main>
  );
}
