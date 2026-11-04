import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { newState } from "@/lib/channels/oauth-state";
import { installUrl, STATE_COOKIE } from "@/lib/channels/slack-oauth";
import { env } from "@/lib/env";

export async function GET() {
  const me = await requireMember();
  if (me.role !== "owner") return new Response("only owners can connect channels", { status: 403 });
  const state = await newState(STATE_COOKIE);
  // MOCK_MODE skips Slack and goes straight to our callback.
  redirect(env().MOCK_MODE ? `/api/slack/oauth?code=mock&state=${state}` : installUrl(state));
}
