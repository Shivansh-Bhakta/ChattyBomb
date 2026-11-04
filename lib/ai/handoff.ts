import type { Classification } from "./classify.ts";

export type Decision = { handoff: true; reason: string } | { handoff: false };

/** Pure handoff rule. Order matters: judgment topics never reach the answer step. */
export function beforeAnswer(c: Classification, topScore: number | null, minScore: number): Decision {
  if (c.intent === "refund_complaint") return { handoff: true, reason: "complaint_or_refund" };
  if (c.sensitive) return { handoff: true, reason: "needs_judgment" };
  if (topScore === null || topScore < minScore) return { handoff: true, reason: "no_relevant_documents" };
  return { handoff: false };
}

export function afterAnswer(a: { answerable: boolean; answer: string; confidence: number }, minConfidence: number): Decision {
  if (!a.answerable || !a.answer.trim()) return { handoff: true, reason: "not_in_documents" };
  if (a.confidence < minConfidence) return { handoff: true, reason: "low_confidence" };
  return { handoff: false };
}
