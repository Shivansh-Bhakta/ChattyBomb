import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { installUrl, STATE_COOKIE } from "@/lib/channels/slack-oauth";
import { env } from "@/lib/env";

export async function GET() {
  const me = await requireMember();
  if (me.role !== "owner") return new Response("only owners can connect channels", { status: 403 });
  const state = randomBytes(32).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/api/slack", maxAge: 600 });
  // MOCK_MODE skips Slack and goes straight to our callback.
  redirect(env().MOCK_MODE ? `/api/slack/oauth?code=mock&state=${state}` : installUrl(state));
}
