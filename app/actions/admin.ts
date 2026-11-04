"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addRate as add, changePlan as plan, grantPilotDays as grant, setOverage as overage, setSuspended, setTenantAlert as tenantAlert } from "@/lib/admin";
import { setAlertSettings } from "@/lib/alerts";
import { requireAdmin } from "@/lib/auth";

const tid = (f: FormData) => z.guid().parse(f.get("tenantId"));
const done = (path: string) => { revalidatePath("/admin"); revalidatePath(path); };

export async function suspendTenant(f: FormData) {
  const me = await requireAdmin();
  await setSuspended(me.id, tid(f), f.get("suspend") === "true");
  done(`/admin/tenants/${tid(f)}`);
}
export async function changePlan(f: FormData) {
  const me = await requireAdmin();
  await plan(me.id, tid(f), { plan: z.enum(["starter", "growth", "scale"]).parse(f.get("plan")), limit: f.get("limit") ? Number(f.get("limit")) : undefined });
  done(`/admin/tenants/${tid(f)}`);
}
export async function grantPilotDays(f: FormData) {
  const me = await requireAdmin();
  await grant(me.id, tid(f), Number(f.get("days")));
  done(`/admin/tenants/${tid(f)}`);
}
export async function setOverage(f: FormData) {
  const me = await requireAdmin();
  await overage(me.id, tid(f), String(f.get("policy")));
  done(`/admin/tenants/${tid(f)}`);
}
export async function setTenantAlert(f: FormData) {
  const me = await requireAdmin();
  const raw = String(f.get("inr") ?? "").trim();
  await tenantAlert(me.id, tid(f), raw === "" ? null : Number(raw));
  done(`/admin/tenants/${tid(f)}`);
}
export async function addRate(f: FormData) {
  const me = await requireAdmin();
  try {
    const v = Object.fromEntries([...f.entries()].filter(([k, x]) => !k.startsWith("$") && x !== ""));
    await add(me.id, v as never);
  } catch (e) {
    console.error("[admin addRate]", (e as Error).message);
    redirect("/admin?error=rate");
  }
  done("/admin");
}
export async function saveAlerts(f: FormData) {
  const me = await requireAdmin();
  const v = Object.fromEntries([...f.entries()].filter(([k, x]) => !k.startsWith("$") && x !== "")) as Record<string, string>;
  try {
    await setAlertSettings(me.id, v);
  } catch {
    redirect("/admin?error=alerts");
  }
  done("/admin");
}
export async function assistWhatsApp(f: FormData) {
  const me = await requireAdmin();
  const tenantId = tid(f);
  const { saveWhatsAppChannel } = await import("@/lib/channels/whatsapp-connect");
  let ok = true;
  try {
    await saveWhatsAppChannel(tenantId, { id: me.id, type: "platform_admin" }, Object.fromEntries(f) as never);
  } catch (e) {
    console.error("[assistWhatsApp]", (e as Error).message);
    ok = false;
  }
  redirect(`/admin/tenants/${tenantId}?${ok ? "connected=whatsapp" : "error=whatsapp"}`);
}
export async function assistImap(f: FormData) {
  const me = await requireAdmin();
  const tenantId = tid(f);
  const { imapCreds } = await import("@/lib/channels/email");
  const { saveEmailChannel, testImap } = await import("@/lib/channels/email-connect");
  let ok = true;
  try {
    const v = z.object({ address: z.string().trim().toLowerCase().email(), user: z.string().min(1), pass: z.string().min(1), imapHost: z.string().min(1), imapPort: z.coerce.number().int(), smtpHost: z.string().min(1), smtpPort: z.coerce.number().int() }).parse(Object.fromEntries(f));
    const creds = imapCreds.parse({ user: v.user, pass: v.pass, imap: { host: v.imapHost, port: v.imapPort, secure: v.imapPort === 993 }, smtp: { host: v.smtpHost, port: v.smtpPort, secure: v.smtpPort === 465 } });
    await testImap(creds);
    await saveEmailChannel(tenantId, me.id, "imap", v.address, creds, "platform_admin");
  } catch (e) {
    console.error("[assistImap]", (e as Error).message);
    ok = false;
  }
  redirect(`/admin/tenants/${tenantId}?${ok ? "connected=email" : "error=email"}`);
}
