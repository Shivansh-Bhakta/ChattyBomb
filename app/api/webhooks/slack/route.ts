import { asService } from "@/lib/db";
import { ingestMessages } from "@/lib/channels/inbound";
import { slack, slackBody } from "@/lib/channels/slack";
import "@/lib/ai/pipeline"; // registers the message.received handler (inline in MOCK_MODE)

const MAX_BODY = 1_000_000;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
  if (!slack.verify(raw, req.headers)) return new Response("invalid signature", { status: 401 });
  let body, parsed;
  try {
    body = slackBody.parse(JSON.parse(raw));
    parsed = slack.parse(raw);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });

  // Only DMs to the bot and the one support channel the business chose.
  const { rows: [ch] } = await asService((db) => db.query(`select config from channels where type = 'slack' and external_id = $1`, [body.team_id]));
  const supportChannel = ch?.config?.channel_id as string | undefined;
  const wanted = parsed.messages.filter((m) => m.threadId.startsWith("D") || (supportChannel && m.threadId.startsWith(`${supportChannel}:`)));
  await ingestMessages("slack", "slack", wanted);
  return new Response("ok", { status: 200 });
}
