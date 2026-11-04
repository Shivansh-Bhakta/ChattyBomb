import { processInbound } from "@/lib/ai/pipeline";
import { pollAllEmail } from "@/lib/channels/email-poll";
import { inngest } from "@/lib/queue";

// Thin wrappers; logic lives in lib/ so MOCK_MODE can call it inline. Retries with backoff come from Inngest.
export const functions = [
  inngest.createFunction(
    { id: "process-inbound", retries: 3, triggers: [{ event: "message.received" }], concurrency: { key: "event.data.tenantId", limit: 5 } },
    async ({ event }) => processInbound(event.data as { tenantId: string; messageId: string }),
  ),
  inngest.createFunction({ id: "poll-email", retries: 0, triggers: [{ cron: "*/2 * * * *" }] }, () => pollAllEmail()),
];
