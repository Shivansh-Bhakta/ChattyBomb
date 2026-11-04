/** Splits text into ~maxChars chunks on paragraph/sentence boundaries, with one paragraph of overlap. */
export function chunkText(text: string, maxChars = 1200): string[] {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
    .flatMap((p) => (p.length <= maxChars ? [p] : p.match(new RegExp(`.{1,${maxChars}}(?:[.!?]\\s|$)`, "gs")) ?? [p]));
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const p of paras) {
    if (cur.length && cur.join("\n\n").length + p.length > maxChars) {
      chunks.push(cur.join("\n\n"));
      cur = cur.slice(-1).filter((last) => last.length < maxChars / 2); // overlap
    }
    cur.push(p);
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return chunks;
}
