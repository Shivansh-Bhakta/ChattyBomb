import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { GOOGLE_STATE_COOKIE, googleInstallUrl } from "@/lib/channels/email-connect";
import { newState } from "@/lib/channels/oauth-state";
import { env } from "@/lib/env";

export async function GET() {
  const me = await requireMember();
  if (me.role !== "owner") return new Response("only owners can connect channels", { status: 403 });
  const state = await newState(GOOGLE_STATE_COOKIE);
  redirect(env().MOCK_MODE ? `/api/google/oauth?code=mock&state=${state}` : googleInstallUrl(state));
}
