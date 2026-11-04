import { randomUUID } from "node:crypto";
import type { OutboundMessage, SendTarget } from "./types.ts";

/** MOCK_MODE stand-in for provider send APIs. Tests read the outbox. */
export const mockOutbox: { channel: string; target: SendTarget; msg: OutboundMessage; providerMessageId: string }[] = [];

export async function mockSend(channel: string, target: SendTarget, msg: OutboundMessage) {
  const providerMessageId = `mock-${channel}-${randomUUID()}`;
  mockOutbox.push({ channel, target, msg, providerMessageId });
  return { providerMessageId };
}
