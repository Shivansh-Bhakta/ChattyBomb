import type { Channel } from "../metering.ts";
import type { ChannelAdapter } from "./types.ts";
import { whatsapp } from "./whatsapp.ts";

const adapters: Partial<Record<Channel, ChannelAdapter>> = { whatsapp };

export function adapterFor(type: Channel): ChannelAdapter {
  const a = adapters[type];
  if (!a) throw new Error(`no adapter for channel ${type}`);
  return a;
}
