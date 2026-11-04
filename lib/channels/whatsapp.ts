import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env, secret } from "../env.ts";
import { mockSend } from "./mock.ts";
import type { ChannelAdapter, Parsed } from "./types.ts";

export const WINDOW_MS = 24 * 60 * 60 * 1000;

const payload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        metadata: z.object({ phone_number_id: z.string().min(1) }),
        contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).partial().optional() })).optional(),
        messages: z.array(z.object({
          id: z.string().min(1).max(256),
          from: z.string().regex(/^[1-9][0-9]{6,14}$/),
          type: z.string(),
          text: z.object({ body: z.string().max(4096) }).optional(),
        })).optional(),
        statuses: z.array(z.object({
          id: z.string().min(1).max(256),
          status: z.enum(["sent", "delivered", "read", "failed"]),
          errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() })).optional(),
        })).optional(),
      }),
    })),
  })),
});

export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"), "hex");
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const whatsapp: ChannelAdapter = {
  type: "whatsapp",

  verify: (rawBody, headers) => verifySignature(rawBody, headers.get("x-hub-signature-256"), secret("WHATSAPP_APP_SECRET")),

  parse(rawBody) {
    const body = payload.parse(JSON.parse(rawBody));
    const out: Parsed = { messages: [], statuses: [] };
    for (const e of body.entry) for (const c of e.changes) {
      if (c.field !== "messages") continue;
      const v = c.value, phoneId = v.metadata.phone_number_id;
      for (const m of v.messages ?? []) {
        const name = v.contacts?.find((x) => x.wa_id === m.from)?.profile?.name;
        out.messages.push({
          providerMessageId: m.id, channelExternalId: phoneId, threadId: `+${m.from}`,
          from: { phone: `+${m.from}`, name }, body: m.text?.body ?? `[${m.type} message]`,
        });
      }
      for (const s of v.statuses ?? []) {
        const err = s.errors?.[0];
        out.statuses.push({ providerMessageId: s.id, channelExternalId: phoneId, status: s.status, error: err ? err.message ?? err.title : undefined });
      }
    }
    return out;
  },

  async send(target, msg) {
    if (env().MOCK_MODE) return mockSend("whatsapp", target, msg);
    if (!target.credentials) throw new Error("WhatsApp channel has no access token");
    const body = msg.kind === "text"
      ? { messaging_product: "whatsapp", to: target.to.replace(/^\+/, ""), type: "text", text: { body: msg.text } }
      : { messaging_product: "whatsapp", to: target.to.replace(/^\+/, ""), type: "template",
          template: { name: msg.name, language: { code: msg.language },
            components: msg.params?.length ? [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }] : [] } };
    const res = await fetch(`https://graph.facebook.com/${env().WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(target.channelExternalId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${target.credentials}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${json?.error?.message ?? "unknown error"}`);
    const id = json?.messages?.[0]?.id;
    if (typeof id !== "string") throw new Error("WhatsApp send returned no message id");
    return { providerMessageId: id };
  },

  canSendFreeform(conv, now = new Date()) {
    if (!conv.last_inbound_at) return false;
    return now.getTime() - new Date(conv.last_inbound_at).getTime() < WINDOW_MS;
  },
};
