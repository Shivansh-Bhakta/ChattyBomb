import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/** Printable tax invoice (browser "Print → Save as PDF"). FORMAT TO BE REVIEWED BY AN ACCOUNTANT. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = z.guid().safeParse((await params).id);
  if (!id.success || me.role !== "owner") notFound();
  const data = await asUser(me.id, async (db) => {
    const { rows: [inv] } = await db.query(`select * from invoices where id = $1`, [id.data]);
    const { rows: [t] } = await db.query(`select name, billing_name, billing_address, gstin from tenants where id = $1`, [me.tenantId]);
    return inv ? { inv, t } : null;
  });
  if (!data) notFound();
  const { inv, t } = data;
  const lines = inv.lines as { description: string; amount_paise: number; kind: string }[];
  const ist = (d: Date) => new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
  return (
    <main className="mx-auto max-w-2xl space-y-6 bg-white p-8 text-sm print:p-0">
      <header className="flex justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tax invoice</h1>
          <p>{inv.number} · {inv.status}</p>
          <p className="text-slate-500">Period {ist(inv.period_start)} to {ist(new Date(new Date(inv.period_end).getTime() - 1))}</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{process.env.SUPPLIER_NAME ?? "ChattyBomb (supplier name not set)"}</p>
          <p>{process.env.SUPPLIER_ADDRESS ?? ""}</p>
          <p>GSTIN {process.env.SUPPLIER_GSTIN ?? "(not set)"}</p>
        </div>
      </header>
      <section>
        <p className="text-slate-500">Bill to</p>
        <p className="font-medium">{t.billing_name || t.name}</p>
        <p>{t.billing_address}</p>
        {t.gstin && <p>GSTIN {t.gstin}</p>}
      </section>
      <table className="w-full">
        <tbody>
          {lines.map((l, i) => <tr key={i} className="border-t border-slate-200"><td className="py-2">{l.description}</td><td className="text-right">{rs(l.amount_paise)}</td></tr>)}
          <tr className="border-t-2 border-slate-400 font-semibold"><td className="py-2">Total</td><td className="text-right">{rs(Number(inv.total_paise))}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-500">Prices in INR. GST charged at 18% on all lines. The plan is charged by your Razorpay subscription; overage and Meta template fees are added to your next renewal.</p>
    </main>
  );
}
