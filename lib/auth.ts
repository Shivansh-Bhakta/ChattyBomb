import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asService, asUser } from "./db.ts";
import { mockAuthAllowed } from "./env.ts";
import { supabaseServer } from "./supabase/server.ts";

export const MOCK_COOKIE = "mock_uid";
export type Member = { id: string; tenantId: string | null; role: "platform_admin" | "owner" | "agent"; name: string; email: string };

/** Verified auth user, or null. Mock cookie only outside production in MOCK_MODE. */
export async function authUser(): Promise<{ id: string; email: string } | null> {
  if (mockAuthAllowed()) {
    const v = (await cookies()).get(MOCK_COOKIE)?.value;
    if (!z.guid().safeParse(v).success) return null;
    const { rows } = await asService((db) => db.query("select id, email from auth.users where id = $1", [v]));
    return rows[0] ?? null;
  }
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

export async function getMember(userId: string): Promise<Member | null> {
  return asUser(userId, async (db) => {
    const { rows } = await db.query(
      `select id, tenant_id as "tenantId", role, name, email from users where id = auth.uid()`,
    );
    return rows[0] ?? null;
  });
}

/** Signed-in tenant member, or redirect to login/onboarding. */
export async function requireMember(): Promise<Member & { tenantId: string }> {
  const u = await authUser();
  if (!u) redirect("/login");
  const m = await getMember(u.id);
  if (!m) redirect("/onboarding");
  if (!m.tenantId) redirect("/admin");
  return m as Member & { tenantId: string };
}
