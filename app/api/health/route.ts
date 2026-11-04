import { asService } from "@/lib/db";

/** Uptime check: 200 when the app can reach Postgres, 503 otherwise. No details are exposed. */
export async function GET() {
  try {
    await asService((db) => db.query("select 1")); // scope: platform-job (no tenant data)
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
