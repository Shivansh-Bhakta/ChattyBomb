import { inngest } from "@/lib/queue";

// Inngest functions are thin wrappers; logic lives in lib/ so MOCK_MODE can call it inline.
export const functions: ReturnType<typeof inngest.createFunction>[] = [];
