import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { z } from "zod";
import { asService } from "../db.ts";
import { env, secret } from "../env.ts";
import { mockSend } from "./mock.ts";
import type { ChannelAdapter, InboundMessage } from "./types.ts";

/** Encrypted credential payloads. Never passwords of the business's main account: Gmail OAuth or an IMAP app password. */
export const gmailCreds = z.object({ refresh_token: z.string().min(1) });
export const imapCreds = z.object({
  user: z.string().min(1).max(320),
  pass: z.string().min(1).max(200),
  imap: z.object({ host: z.string().min(1).max(253), port: z.coerce.number().int().min(1).max(65535), secure: z.boolean() }),
  smtp: z.object({ host: z.string().min(1).max(253), port: z.coerce.number().int().min(1).max(65535), secure: z.boolean() }),
});

const ids = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(/\s+/) : []).map((x) => x.trim()).filter(Boolean);

/** Machine senders we never answer (bounces, notifications). */
export const isMachineSender = (address: string) =>
  /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster)([+._-].*)?@/i.test(address);

/** Removes quoted history so the AI and inbox see only the new text. */
export function stripQuoted(text: string) {
  const cut = text.search(/^(On .{3,200}wrote:|-----Original Message-----|From: .+\nSent: )/m);
  return (cut > 0 ? text.slice(0, cut) : text).split("\n").filter((l) => !l.startsWith(">")).join("\n").trim();
}

/**
 * Parses one raw RFC 822 email into an InboundMessage, or null for mail we must not answer
 * (our own sends, auto-replies, bulk/list mail): that prevents reply loops.
 * Thread = root of References, else In-Reply-To, else this Message-ID.
 */
export async function parseEmail(raw: string | Buffer, channelAddress: string): Promise<InboundMessage | null> {
  const m = await simpleParser(raw);
  const from = m.from?.value[0];
  const address = from?.address?.toLowerCase();
  const messageId = m.messageId;
  if (!address || !messageId || address === channelAddress.toLowerCase() || isMachineSender(address)) return null;
  const h = (k: string) => String(m.headers.get(k) ?? "").toLowerCase();
  if ((h("auto-submitted") && h("auto-submitted") !== "no") || /bulk|junk|list|auto_reply/.test(h("precedence")) || m.headers.has("list") || m.headers.has("list-id") || m.headers.has("x-autoreply")) return null;
  const refs = ids(m.references), inReplyTo = ids(m.inReplyTo)[0];
  const text = stripQuoted(m.text ?? "").slice(0, 20_000);
  return {
    providerMessageId: messageId,
    channelExternalId: channelAddress.toLowerCase(),
    threadId: refs[0] ?? inReplyTo ?? messageId,
    from: { email: address, name: from?.name || undefined },
    body: `Subject: ${m.subject ?? "(no subject)"}\n\n${text}`,
    emailMessageId: messageId,
    inReplyTo,
  };
}

async function googleAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: secret("GOOGLE_CLIENT_ID"), client_secret: secret("GOOGLE_CLIENT_SECRET"), refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`Google token refresh failed: ${j.error ?? res.status}`);
  return j.access_token;
}

export async function gmailFetch(refreshToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await googleAccessToken(refreshToken)}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Gmail API ${path.split("?")[0]} failed (${res.status})`);
  return res.json();
}

export const email: ChannelAdapter = {
  type: "email",
  // Email arrives by polling (Gmail API / IMAP), never through an unauthenticated webhook.
  verify: () => false,
  parse: () => { throw new Error("email is polled, not pushed: use parseEmail()"); },

  async send(target, msg) {
    if (msg.kind !== "text") throw new Error("email has no message templates");
    if (env().MOCK_MODE) return mockSend("email", target, msg);
    if (!target.credentials) throw new Error("email channel has no credentials");
    const address = target.channelExternalId;
    // Reply headers come from the latest customer email in this thread.
    const { rows: [last] } = await asService((db) => db.query( // scope: webhook-lookup (channel external_id is unique, so this is one tenant's thread)
      `select m.email_message_id, m.body from messages m join conversations c on c.id = m.conversation_id join channels ch on ch.id = c.channel_id
        where ch.type = 'email' and ch.external_id = $1 and c.external_thread_id = $2 and m.direction = 'inbound'
        order by m.created_at desc limit 1`, [address, target.threadId]));
    const subject = (last?.body.match(/^Subject: (.*)$/m)?.[1] ?? "Your message").replace(/^(re:\s*)+/i, "");
    const messageId = `<${randomUUID()}@${address.split("@")[1]}>`;
    const mail = {
      from: address, to: target.to, subject: `Re: ${subject}`, text: msg.text, messageId,
      inReplyTo: last?.email_message_id ?? target.threadId,
      references: [...new Set([target.threadId, last?.email_message_id].filter(Boolean))].join(" "),
    };
    const creds = JSON.parse(target.credentials);
    if (target.config.provider === "gmail" || "refresh_token" in creds) {
      const { refresh_token } = gmailCreds.parse(creds);
      const built = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(mail);
      const raw = Buffer.from(built.message as Buffer).toString("base64url");
      await gmailFetch(refresh_token, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    } else {
      const c = imapCreds.parse(creds);
      await nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: { user: c.user, pass: c.pass } }).sendMail(mail);
    }
    return { providerMessageId: messageId };
  },

  canSendFreeform: () => true,
};
