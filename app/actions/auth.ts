"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authUser, MOCK_COOKIE } from "@/lib/auth";
import { asService } from "@/lib/db";
import { mockAuthAllowed } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { createTenant, onboardingSchema } from "@/lib/tenants";

const creds = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(200) });
const cookieOpts = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

export async function mockLogin(form: FormData) {
  if (!mockAuthAllowed()) throw new Error("mock login disabled");
  const id = z.guid().parse(form.get("userId"));
  (await cookies()).set(MOCK_COOKIE, id, cookieOpts);
  redirect("/");
}

export async function login(form: FormData) {
  const { email, password } = creds.parse(Object.fromEntries(form));
  const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=1");
  redirect("/");
}

export async function signup(form: FormData) {
  const { email, password } = creds.parse(Object.fromEntries(form));
  if (mockAuthAllowed()) {
    const { rows } = await asService((db) =>
      db.query("insert into auth.users (email) values ($1) on conflict (email) do nothing returning id", [email]),
    );
    if (!rows[0]) redirect("/signup?error=exists");
    (await cookies()).set(MOCK_COOKIE, rows[0].id, cookieOpts);
    redirect("/onboarding");
  }
  const { data, error } = await (await supabaseServer()).auth.signUp({ email, password });
  if (error) redirect("/signup?error=1");
  redirect(data.session ? "/onboarding" : "/login?check_email=1");
}

export async function onboard(form: FormData) {
  const u = await authUser();
  if (!u) redirect("/login");
  await createTenant(u.id, u.email, onboardingSchema.parse(Object.fromEntries(form)));
  redirect("/inbox");
}

export async function logout() {
  if (mockAuthAllowed()) (await cookies()).delete(MOCK_COOKIE);
  else await (await supabaseServer()).auth.signOut();
  redirect("/login");
}
