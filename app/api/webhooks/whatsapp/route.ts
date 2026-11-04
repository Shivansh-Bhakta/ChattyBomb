import { timingSafeEqual } from "node:crypto";
import { applyStatuses, ingestMessages } from "@/lib/channels/inbound";
import { whatsapp } from "@/lib/channels/whatsapp";
import { secret } from "@/lib/env";
import { rejectUnverified, tooLarge } from "@/lib/rate-limit";
import "@/lib/ai/pipeline"; // registers the message.received handler (inline in MOCK_MODE)

const MAX_BODY = 1_000_000;

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = Buffer.from(p.get("hub.verify_token") ?? ""), expected = Buffer.from(secret("WHATSAPP_VERIFY_TOKEN"));
  if (p.get("hub.mode") === "subscribe" && token.length === expected.length && timingSafeEqual(token, expected)) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return rejectUnverified("whatsapp-verify", req.headers, 403, "forbidden");
}

export async function POST(req: Request) {
  if (tooLarge(req.headers, MAX_BODY)) return new Response("too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
  if (!whatsapp.verify(raw, req.headers)) return rejectUnverified("whatsapp", req.headers, 401, "invalid signature");
  let parsed;
  try {
    parsed = whatsapp.parse(raw);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  await ingestMessages("whatsapp", "whatsapp", parsed.messages);
  await applyStatuses("whatsapp", "whatsapp", parsed.statuses);
  return new Response("ok", { status: 200 });
}
