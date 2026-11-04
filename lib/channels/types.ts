import type { Channel } from "../metering.ts";

/** One common shape for every channel. New channel = one file implementing ChannelAdapter. */
export type InboundMessage = {
  providerMessageId: string;
  channelExternalId: string; // routes to exactly one tenant via channels(type, external_id)
  threadId: string; // conversations.external_thread_id
  from: { name?: string; phone?: string; email?: string; slackUserId?: string };
  body: string;
  emailMessageId?: string;
  inReplyTo?: string;
};

export type StatusUpdate = {
  providerMessageId: string;
  channelExternalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
};

export type Parsed = { messages: InboundMessage[]; statuses: StatusUpdate[] };

export type TemplateCategory = "marketing" | "utility" | "authentication";
export type OutboundMessage =
  | { kind: "text"; text: string }
  | { kind: "template"; name: string; language: string; category: TemplateCategory; params?: string[] };

export type SendTarget = {
  channelExternalId: string;
  credentials: string | null; // decrypted token, null in mock mode
  to: string; // phone / slack channel / email address
  threadId: string;
  config: Record<string, unknown>;
};

export interface ChannelAdapter {
  type: Channel;
  /** Verifies the provider signature over the exact raw body. Must be constant-time. */
  verify(rawBody: string, headers: Headers): boolean;
  /** Validates and normalises a webhook body. Throws on malformed input. */
  parse(rawBody: string): Parsed;
  send(target: SendTarget, msg: OutboundMessage): Promise<{ providerMessageId: string }>;
  /** Whether a free-form (non-template) reply is allowed right now. */
  canSendFreeform(conv: { last_inbound_at: Date | string | null }, now?: Date): boolean;
}

/**
 * Thrown by adapters only when the provider definitely did NOT accept the message (rejected before
 * or by the provider, e.g. 4xx, Slack ok:false, missing credentials). Any other error is treated
 * as "may have been delivered" and is never re-sent automatically.
 */
export class ProviderRejectedError extends Error {
  override name = "ProviderRejectedError";
}
