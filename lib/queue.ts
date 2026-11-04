import { Inngest } from "inngest";
import { env } from "./env.ts";

export const inngest = new Inngest({ id: "chattybomb" });

export type Events = { "message.received": { tenantId: string; messageId: string } };
type Handler<K extends keyof Events> = (data: Events[K]) => Promise<unknown>;
const handlers: { [K in keyof Events]?: Handler<K> } = {};

/** Registers the plain function behind an Inngest event (used inline in MOCK_MODE). */
export function onEvent<K extends keyof Events>(name: K, fn: Handler<K>) {
  handlers[name] = fn as never;
}

/** Real mode: Inngest (retries with backoff). MOCK_MODE: runs the handler inline, errors logged. */
export async function enqueue<K extends keyof Events>(name: K, data: Events[K]) {
  if (!env().MOCK_MODE) return void (await inngest.send({ name, data }));
  const fn = handlers[name] as Handler<K> | undefined;
  if (!fn) return;
  try {
    await fn(data);
  } catch (e) {
    console.error(`[queue] ${name} failed`, (e as Error).message);
  }
}
