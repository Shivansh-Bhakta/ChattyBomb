import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../env.ts";
import { claude, type Usage } from "./claude.ts";

export const INTENTS = ["booking", "refund_complaint", "price_query", "sales_lead", "other"] as const;

const schema = z.object({
  intent: z.enum(INTENTS),
  language: z.enum(["en", "hi", "hinglish"]),
  sensitive: z.boolean().describe("true if answering needs medical, legal or financial judgment"),
  summary: z.string().describe("one or two sentences: who the customer is and what they need"),
});
export type Classification = z.infer<typeof schema>;

const SYSTEM = `You classify customer messages for an Indian local service business (clinic, salon, coaching centre).
Return the intent of the latest customer message, its language (en, hi for Devanagari Hindi, hinglish for Hindi in Latin script),
whether answering it needs medical, legal or financial judgment (sensitive), and a short summary of the conversation for a human agent.
Complaints, refund requests, billing disputes and angry messages are refund_complaint.`;

/** Small model. `transcript` is recent conversation lines, oldest first, latest customer message last. */
export async function classify(transcript: string): Promise<{ result: Classification; usage: Usage }> {
  if (env().MOCK_MODE) return { result: mockClassify(transcript), usage: null };
  const model = env().AI_CLASSIFY_MODEL;
  const res = await claude().messages.parse({
    model,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: transcript }],
  });
  // A refusal or unparsable output is treated as "needs a human", never as a guess.
  const result = res.stop_reason === "refusal" ? null : res.parsed_output;
  return {
    result: result ?? { intent: "other", language: "en", sensitive: true, summary: "Automatic classification failed; please review." },
    usage: { model: res.model, usage: res.usage },
  };
}

function mockClassify(transcript: string): Classification {
  const last = transcript.trim().split("\n").at(-1) ?? "";
  const t = last.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const intent = has(/refund|complain|charged twice|overcharg|cheat|worst|angry|rude|paisa wapas|shikayat|not happy|bakwas/) ? "refund_complaint"
    : has(/book|appointment|slot|reschedul|available on|kal aa/) ? "booking"
    : has(/price|cost|fee|charges|kitna|kitne|rate|how much|rs\b|₹/) ? "price_query"
    : has(/interested|join|enrol|admission|demo|membership|package/) ? "sales_lead"
    : "other";
  const sensitive = has(/diagnos|prescri|medicine|tablet|dose|dosage|symptom|side effect|pregnan|lawyer|legal|court|sue\b|should i take/);
  const language = /[ऀ-ॿ]/.test(last) ? "hi" : /\b(hai|kya|kitne|kitna|kal|mujhe|aap|nahi|karna|chahiye)\b/.test(t) ? "hinglish" : "en";
  return { intent, language, sensitive, summary: `Customer said: "${last.slice(0, 200)}" (${intent.replace("_", "/")}).` };
}
