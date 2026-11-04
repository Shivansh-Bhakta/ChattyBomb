import { asService } from "../db.ts";
import { createAddon } from "./razorpay.ts";

export const GST_RATE = 0.18;
const rupeesToPaise = (inr: number) => Math.round(inr * 100);

/** Previous calendar month in IST, as UTC instants [start, end). */
export function previousMonthIST(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(); // current IST month
  const start = new Date(Date.UTC(y, m - 1, 1) - 5.5 * 3600_000);
  const end = new Date(Date.UTC(y, m, 1) - 5.5 * 3600_000);
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return { start, end, label: `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}` };
}

type Line = { description: string; amount_paise: number; kind: "plan" | "overage" | "meta_passthrough" | "gst" };

/**
 * Builds invoice lines for one period. GST 18% is charged on every line, including Meta fees
 * passed through at cost. FLAG FOR ACCOUNTANT: GST on pass-through (pure-agent rules), IGST vs
 * CGST+SGST by place of supply, SAC code, and invoice numbering per financial year.
 */
export function invoiceLines(p: { planName: string; planPaise: number; used: number; limit: number; overagePolicy: string; overageRateInr: number | null; metaFeesInr: number }) {
  const lines: Line[] = [{ kind: "plan", description: `ChattyBomb ${p.planName} plan (monthly)`, amount_paise: p.planPaise }];
  const extra = Math.max(0, p.used - p.limit);
  if (p.overagePolicy === "bill_overage" && extra > 0) {
    if (p.overageRateInr === null) throw new Error("missing rate plan:overage:per_conversation");
    lines.push({ kind: "overage", description: `Overage: ${extra} conversations over ${p.limit}`, amount_paise: rupeesToPaise(extra * p.overageRateInr) });
  }
  const meta = rupeesToPaise(p.metaFeesInr);
  if (meta > 0) lines.push({ kind: "meta_passthrough", description: "WhatsApp template fees (Meta), passed through at cost", amount_paise: meta });
  const subtotal = lines.reduce((n, l) => n + l.amount_paise, 0);
  const gst = Math.round(subtotal * GST_RATE);
  lines.push({ kind: "gst", description: "GST @ 18%", amount_paise: gst });
  const by = (k: Line["kind"]) => lines.filter((l) => l.kind === k).reduce((n, l) => n + l.amount_paise, 0);
  return { lines, subtotal_paise: by("plan"), overage_paise: by("overage"), meta_fees_paise: by("meta_passthrough"), gst_paise: gst, total_paise: subtotal + gst };
}

/**
 * Issues last month's invoice for every tenant with a live subscription (idempotent per tenant+period).
 * The plan is charged by the subscription; overage + Meta fees (+GST) are added to the next renewal as a Razorpay add-on.
 */
export async function generateMonthlyInvoices(now = new Date()) {
  const period = previousMonthIST(now);
  const { rows: subs } = await asService((db) => db.query( // scope: platform-job (each invoice is written for its own tenant)
    `select s.id, s.tenant_id, s.plan, s.amount_paise::int as amount_paise, s.razorpay_subscription_id, t.conversation_limit, t.overage_policy
       from subscriptions s join tenants t on t.id = s.tenant_id where s.status in ('active', 'halted')`));
  const issued: string[] = [];
  for (const s of subs) {
    const inv = await asService(async (db) => { // scope: tenant
      const { rows: [u] } = await db.query(
        `select count(*) filter (where event_type = 'conversation_billed')::int as used,
                coalesce(sum(total_cost_inr) filter (where event_type in ('wa_template_message','wa_service_message')), 0)::float as meta
           from usage_events where tenant_id = $1 and created_at >= $2 and created_at < $3`, [s.tenant_id, period.start, period.end]);
      const { rows: [rate] } = await db.query(`select value::float from rates where key = 'plan:overage:per_conversation' and effective_from <= $1 order by effective_from desc limit 1`, [period.end]);
      const calc = invoiceLines({ planName: s.plan, planPaise: s.amount_paise, used: u.used, limit: s.conversation_limit, overagePolicy: s.overage_policy, overageRateInr: rate?.value ?? null, metaFeesInr: u.meta });
      const { rows: [row] } = await db.query(
        `insert into invoices (tenant_id, subscription_id, number, period_start, period_end, subtotal_paise, meta_fees_paise, overage_paise, gst_paise, total_paise, status, lines)
         values ($1, $2, 'CB-' || $3 || '-' || lpad(nextval('invoice_seq')::text, 5, '0'), $4, $5, $6, $7, $8, $9, $10, 'issued', $11)
         on conflict (tenant_id, period_start) do nothing returning id, number`,
        [s.tenant_id, s.id, period.label.replace("-", ""), period.start, period.end, calc.subtotal_paise, calc.meta_fees_paise, calc.overage_paise, calc.gst_paise, calc.total_paise, JSON.stringify(calc.lines)]);
      return row ? { ...row, extraPaise: Math.round((calc.overage_paise + calc.meta_fees_paise) * (1 + GST_RATE)) } : null;
    });
    if (!inv) continue; // already issued for this period
    issued.push(inv.number);
    if (inv.extraPaise > 0 && s.razorpay_subscription_id) {
      try {
        await createAddon(s.razorpay_subscription_id, inv.extraPaise, `Usage ${period.label} (${inv.number})`);
      } catch (e) {
        console.error(`[invoices] add-on for ${inv.number} failed; charge manually:`, (e as Error).message);
      }
    }
  }
  return issued;
}
