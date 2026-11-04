import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../env.ts";
import { claude, type Usage } from "./claude.ts";
import { words } from "./embed.ts";

const schema = z.object({
  answerable: z.boolean().describe("false if the documents do not clearly contain the answer"),
  answer: z.string().describe("reply to send the customer, or empty when not answerable"),
  confidence: z.number().describe("0 to 1: how fully the documents support this exact answer"),
});
export type Answer = z.infer<typeof schema>;
export type Chunk = { content: string; score: number };

// Frozen text: kept byte-identical across requests so the prompt cache can hit.
const SYSTEM = `You are the WhatsApp/Slack/email assistant of a small Indian business, replying to its customers.
Rules:
- Answer ONLY from the business documents in the <documents> block. Never use outside knowledge, never guess prices, times or policies.
- If the documents do not clearly answer the question, set answerable=false and leave answer empty.
- Never give medical, legal or financial advice; set answerable=false instead.
- Reply in the customer's language (English, Hindi, or Hinglish as written), friendly and brief (1-3 short sentences), suitable for chat.
- confidence is how fully the documents support your exact answer (0 to 1).`;

export async function answer(question: string, history: string, language: string, chunks: Chunk[]): Promise<{ result: Answer; usage: Usage }> {
  if (env().MOCK_MODE) return { result: mockAnswer(question, chunks), usage: null };
  const model = env().AI_ANSWER_MODEL;
  const docs = `<documents>\n${chunks.map((c, i) => `<doc index="${i + 1}">\n${c.content}\n</doc>`).join("\n")}\n</documents>`;
  const res = await claude().messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: docs, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Recent conversation:\n${history}\n\nCustomer language: ${language}\nLatest customer message: ${question}` },
      ],
    }],
  });
  const out = res.stop_reason === "refusal" ? null : res.parsed_output;
  return {
    result: out ? { ...out, confidence: Math.min(1, Math.max(0, out.confidence)) } : { answerable: false, answer: "", confidence: 0 },
    usage: { model: res.model, usage: res.usage },
  };
}

/** MOCK_MODE: returns the sentences of the best chunk that overlap the question most. */
function mockAnswer(question: string, chunks: Chunk[]): Answer {
  if (!chunks.length) return { answerable: false, answer: "", confidence: 0 };
  const q = new Set(words(question));
  const sentences = chunks.map((c) => c.content).join("\n").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const scored = sentences.map((s) => ({ s, n: words(s).filter((w) => q.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (!scored.length) return { answerable: false, answer: "", confidence: 0 };
  const chosen = scored.slice(0, 2).map((x) => x.s).join(" ");
  const covered = new Set(words(chosen).filter((w) => q.has(w))).size;
  return { answerable: true, answer: chosen, confidence: q.size ? covered / q.size : 0 };
}
