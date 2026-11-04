import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env, secret } from "../env.ts";
import { mockSend } from "./mock.ts";
import type { ChannelAdapter, Parsed } from "./types.ts";

const MAX_SKEW_S = 5 * 60;

/** Slack signing secret check (v0) with replay protection on the request timestamp. */
export function verifySlackSignature(rawBody: string, ts: string | null, sig: string | null, signingSecret: string, nowS = Date.now() / 1000) {
  if (!ts || !sig?.startsWith("v0=") || !/^\d+$/.test(ts) || Math.abs(nowS - Number(ts)) > MAX_SKEW_S) return false;
  const expected = Buffer.from(createHmac("sha256", signingSecret).update(`v0:${ts}:${rawBody}`).digest("hex"), "hex");
  const given = Buffer.from(sig.slice(3), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const event = z.object({
  type: z.string(),
  channel: z.string().optional(),
  channel_type: z.string().optional(),
  user: z.string().optional(),
  text: z.string().max(40_000).optional(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
});
export const slackBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_verification"), challenge: z.string().max(500) }),
  z.object({ type: z.literal("event_callback"), team_id: z.string().min(1), event_id: z.string(), event }),
]);

/**
 * Thread ids: DMs are one conversation per DM channel ("D123"); channel messages are one
 * conversation per Slack thread ("C123:1700000000.000100") and replies go in that thread.
 */
const threadOf = (channel: string, ts: string, threadTs?: string) => (channel.startsWith("D") ? channel : `${channel}:${threadTs ?? ts}`);

export const slack: ChannelAdapter = {
  type: "slack",

  verify: (raw, h) => verifySlackSignature(raw, h.get("x-slack-request-timestamp"), h.get("x-slack-signature"), secret("SLACK_SIGNING_SECRET")),

  parse(raw) {
    const body = slackBody.parse(JSON.parse(raw));
    const out: Parsed = { messages: [], statuses: [] };
    if (body.type !== "event_callback") return out;
    const e = body.event;
    // Ignore our own/bot posts (reply loops), edits, joins etc.: only plain human messages.
    if (e.type !== "message" || e.bot_id || e.subtype || !e.user || !e.channel || !e.ts || !e.text?.trim()) return out;
    out.messages.push({
      providerMessageId: `${e.channel}:${e.ts}`, channelExternalId: body.team_id,
      threadId: threadOf(e.channel, e.ts, e.thread_ts), from: { slackUserId: e.user }, body: e.text,
    });
    return out;
  },

  async send(target, msg) {
    if (msg.kind !== "text") throw new Error("Slack has no message templates");
    if (env().MOCK_MODE) return mockSend("slack", target, msg);
    if (!target.credentials) throw new Error("Slack channel has no bot token");
    const [channel, threadTs] = target.threadId.split(":");
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${target.credentials}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text: msg.text, ...(threadTs && { thread_ts: threadTs }) }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ts?: string; channel?: string };
    if (!res.ok || !json.ok || !json.ts) throw new Error(`Slack send failed: ${json.error ?? res.status}`);
    return { providerMessageId: `${json.channel ?? channel}:${json.ts}` };
  },

  canSendFreeform: () => true,
};
