// Runs the 20-question clinic eval through the real pipeline functions (no DB).
// MOCK_MODE=true uses the mock classifier/answerer; MOCK_MODE=false calls Anthropic + Voyage (costs money).
import { readFileSync } from "node:fs";
import { answer } from "../lib/ai/answer.ts";
import { chunkText } from "../lib/ai/chunk.ts";
import { classify } from "../lib/ai/classify.ts";
import { embed } from "../lib/ai/embed.ts";
import { afterAnswer, beforeAnswer } from "../lib/ai/handoff.ts";
import { env } from "../lib/env.ts";

const doc = readFileSync(new URL("../test/fixtures/sunrise-clinic.md", import.meta.url), "utf8");
const cases: { q: string; expect?: string[]; handoff?: string }[] = JSON.parse(readFileSync(new URL("../test/fixtures/clinic-eval.json", import.meta.url), "utf8"));

const chunks = chunkText(doc, 400);
const { vectors } = await embed(chunks, "document");
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1);

let pass = 0;
for (const c of cases) {
  const { result: cls } = await classify(`Customer: ${c.q}`);
  const { vectors: [qv] } = await embed([c.q], "query");
  const top = chunks.map((content, i) => ({ content, score: cos(qv, vectors[i]) })).sort((a, b) => b.score - a.score).slice(0, 5);
  let got: string, reason = "";
  const pre = beforeAnswer(cls, top[0]?.score ?? null, env().AI_MIN_RETRIEVAL_SCORE);
  if (pre.handoff) { got = "HANDOFF"; reason = pre.reason; }
  else {
    const { result } = await answer(c.q, `Customer: ${c.q}`, cls.language, top);
    const post = afterAnswer(result, env().AI_MIN_CONFIDENCE);
    if (post.handoff) { got = "HANDOFF"; reason = post.reason; } else got = result.answer;
  }
  const ok = c.handoff
    ? got === "HANDOFF" && (c.handoff === "any" || reason === c.handoff)
    : got !== "HANDOFF" && c.expect!.every((e) => got.toLowerCase().includes(e.toLowerCase()));
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.q}\n      → ${got === "HANDOFF" ? `handoff (${reason})` : got.slice(0, 140)}`);
}
console.log(`\n${pass}/${cases.length} passed (MOCK_MODE=${env().MOCK_MODE})`);
process.exitCode = pass === cases.length ? 0 : 1;
