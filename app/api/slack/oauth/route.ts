import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { exchangeCode, saveInstall, STATE_COOKIE } from "@/lib/channels/slack-oauth";

export async function GET(req: Request) {
  const me = await requireMember();
  if (me.role !== "owner") return new Response("only owners can connect channels", { status: 403 });
  const p = new URL(req.url).searchParams;
  const store = await cookies();
  const expected = Buffer.from(store.get(STATE_COOKIE)?.value ?? ""), got = Buffer.from(p.get("state") ?? "");
  store.delete(STATE_COOKIE);
  if (!expected.length || expected.length !== got.length || !timingSafeEqual(expected, got)) return new Response("invalid OAuth state", { status: 400 });
  const code = p.get("code");
  if (!code || p.get("error")) redirect("/settings/channels?error=slack_denied");
  let ok = true;
  try {
    await saveInstall(me.tenantId, me.id, await exchangeCode(code, `T_MOCK_${me.tenantId.slice(-6)}`));
  } catch (e) {
    console.error("[slack oauth]", (e as Error).message);
    ok = false;
  }
  redirect(ok ? "/settings/channels?connected=slack" : "/settings/channels?error=slack_failed");
}
