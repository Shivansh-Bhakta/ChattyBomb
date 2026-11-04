import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { exchangeGoogleCode, GOOGLE_STATE_COOKIE, saveEmailChannel } from "@/lib/channels/email-connect";
import { checkState } from "@/lib/channels/oauth-state";

export async function GET(req: Request) {
  const me = await requireMember();
  if (me.role !== "owner") return new Response("only owners can connect channels", { status: 403 });
  const p = new URL(req.url).searchParams;
  if (!(await checkState(GOOGLE_STATE_COOKIE, p.get("state")))) return new Response("invalid OAuth state", { status: 400 });
  const code = p.get("code");
  if (!code || p.get("error")) redirect("/settings/channels?error=gmail_denied");
  let ok = true;
  try {
    const { refreshToken, address } = await exchangeGoogleCode(code, `support+${me.tenantId.slice(-6)}@mock.test`);
    await saveEmailChannel(me.tenantId, me.id, "gmail", address, { refresh_token: refreshToken });
  } catch (e) {
    console.error("[google oauth]", (e as Error).message);
    ok = false;
  }
  redirect(ok ? "/settings/channels?connected=gmail" : "/settings/channels?error=gmail_failed");
}
