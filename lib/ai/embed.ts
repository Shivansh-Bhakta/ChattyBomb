import { createHash } from "node:crypto";
import { env, secret } from "../env.ts";

export type InputType = "document" | "query";

/**
 * Embeds texts with EMBEDDING_MODEL at EMBEDDING_DIM. Requests that dimension explicitly
 * and throws if any returned vector differs (the pgvector column is fixed-size).
 */
export async function embed(texts: string[], inputType: InputType): Promise<{ vectors: number[][]; tokens: number }> {
  const { EMBEDDING_MODEL: model, EMBEDDING_DIM: dim, MOCK_MODE } = env();
  if (texts.length === 0) return { vectors: [], tokens: 0 };
  let vectors: number[][], tokens: number;
  if (MOCK_MODE) {
    vectors = texts.map((t) => mockEmbedding(t, dim));
    tokens = texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
  } else {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${secret("VOYAGE_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ input: texts, model, input_type: inputType, output_dimension: dim }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed (${res.status})`);
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[]; usage: { total_tokens: number } };
    vectors = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    tokens = json.usage.total_tokens;
  }
  if (vectors.length !== texts.length) throw new Error(`expected ${texts.length} embeddings, got ${vectors.length}`);
  for (const v of vectors) if (v.length !== dim) throw new Error(`embedding has ${v.length} dimensions, expected EMBEDDING_DIM=${dim}`);
  return { vectors, tokens };
}

const STOP = new Set("a an the is are was of to in on for and or at do does what which when how i you we my me your our it this that be can with from have has will get where there please hai ka ki ke kya kitne kitna mera mujhe".split(" "));
export const words = (t: string) =>
  (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ion|ed|es|s)$/, "") : w));

/** MOCK_MODE: deterministic hashed bag-of-words, L2-normalised. Lexical, but enough for tests and the eval. */
function mockEmbedding(text: string, dim: number) {
  const v = new Array<number>(dim).fill(0);
  for (const w of words(text)) v[createHash("md5").update(w).digest().readUInt32BE(0) % dim] += 1;
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
