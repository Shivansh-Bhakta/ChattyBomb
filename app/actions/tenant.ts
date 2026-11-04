"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MOCK_COOKIE, requireMember } from "@/lib/auth";
import { mockAuthAllowed } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteTenant } from "@/lib/tenants";

/** Owner deletes the business and all its data. Requires typing the exact business name. */
export async function deleteMyTenant(form: FormData) {
  const me = await requireMember();
  if (me.role !== "owner") redirect("/settings?error=owner_only");
  const confirm = z.string().max(200).parse(form.get("confirm") ?? "");
  try {
    await deleteTenant(me.tenantId, me.id, confirm);
  } catch (e) {
    console.error("[deleteMyTenant]", (e as Error).message);
    redirect("/settings?error=delete");
  }
  if (mockAuthAllowed()) (await cookies()).delete(MOCK_COOKIE);
  else await (await supabaseServer()).auth.signOut();
  redirect("/signup?deleted=1");
}
