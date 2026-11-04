import { logAdminAction, tenantMetrics, toCsv } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const me = await requireAdmin();
  const rows = await tenantMetrics(me.id);
  await logAdminAction(me.id, "admin.export_csv", { rows: rows.length });
  const csv = toCsv(rows as unknown as Record<string, unknown>[], ["id", "name", "plan", "status", "conversations", "conversation_limit", "ai_cost", "meta_fees", "plan_revenue", "revenue", "cost", "margin", "margin_pct", "negative_margin", "near_limit"]);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="chattybomb-tenants-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
