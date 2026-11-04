import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { mockOutbox } from "../channels/mock.ts";
import { whatsapp as whatsappAdapter } from "../channels/whatsapp.ts";
import { asService, closePool } from "../db.ts";
import { chunkText } from "./chunk.ts";
import { ingestDocument } from "./documents.ts";
import { embed } from "./embed.ts";
import { afterAnswer, beforeAnswer } from "./handoff.ts";
import { A_OWNER, TENANT_A } from "../../test/ids.ts";
import { waMessage, waRequest } from "../../test/whatsapp.ts";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;

describe("handoff rules", () => {
  const ok = { intent: "price_query" as const, language: "en" as const, sensitive: false, summary: "" };
  it("hands off complaints, judgment topics and missing documents before answering", () => {
    expect(beforeAnswer({ ...ok, intent: "refund_complaint" }, 0.9, 0.3)).toEqual({ handoff: true, reason: "complaint_or_refund" });
    expect(beforeAnswer({ ...ok, sensitive: true }, 0.9, 0.3)).toEqual({ handoff: true, reason: "needs_judgment" });
    expect(beforeAnswer(ok, 0.1, 0.3)).toEqual({ handoff: true, reason: "no_relevant_documents" });
    expect(beforeAnswer(ok, null, 0.3)).toEqual({ handoff: true, reason: "no_relevant_documents" });
    expect(beforeAnswer(ok, 0.5, 0.3)).toEqual({ handoff: false });
  });
  it("hands off low-confidence or unanswerable answers", () => {
    expect(afterAnswer({ answerable: true, answer: "Rs 500", confidence: 0.4 }, 0.6)).toEqual({ handoff: true, reason: "low_confidence" });
    expect(afterAnswer({ answerable: false, answer: "", confidence: 0.9 }, 0.6)).toEqual({ handoff: true, reason: "not_in_documents" });
    expect(afterAnswer({ answerable: true, answer: "  ", confidence: 0.9 }, 0.6)).toEqual({ handoff: true, reason: "not_in_documents" });
    expect(afterAnswer({ answerable: true, answer: "Rs 500", confidence: 0.8 }, 0.6)).toEqual({ handoff: false });
  });
});

describe("embeddings", () => {
  it("returns EMBEDDING_DIM vectors and throws on a dimension mismatch", async () => {
    const { vectors } = await embed(["hello"], "query");
    expect(vectors[0]).toHaveLength(1024);
    vi.resetModules();
    for (const [k, v] of Object.entries({ MOCK_MODE: "false", VOYAGE_API_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x" })) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { total_tokens: 1 } })));
    try {
      const real = await import("./embed.ts");
      await expect(real.embed(["hello"], "query")).rejects.toThrow(/expected EMBEDDING_DIM=1024/);
    } finally {
      vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules();
    }
  });

  it("chunks long text without losing content", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about clinic timings and fees.`).join("\n\n");
    const chunks = chunkText(text, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
    for (let i = 0; i < 30; i++) expect(chunks.some((c) => c.includes(`Paragraph ${i} `))).toBe(true);
  });
});

describe("AI pipeline (mock mode, end to end through the WhatsApp webhook)", () => {
  beforeAll(async () => {
    const bytes = new TextEncoder().encode(readFileSync(new URL("../../test/fixtures/sunrise-clinic.md", import.meta.url), "utf8"));
    await ingestDocument(TENANT_A, A_OWNER, { name: "faq.md", type: "text/markdown", bytes });
  });

  const send = async (id: string, from: string, text: string) => {
    expect((await POST(waRequest(waMessage(id, from, text)))).status).toBe(200);
    const [m] = await q("select conversation_id, intent from messages where provider_message_id = $1", [id]);
    const [c] = await q("select status, summary from conversations where id = $1", [m.conversation_id]);
    return { ...m, ...c };
  };

  it("answers from the documents and meters + audits the reply", async () => {
    const r = await send("wamid.ai1", "919100000001", "What is the price of a CBC test?");
    expect(r.intent).toBe("price_query");
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].msg).toMatchObject({ kind: "text" });
    expect((mockOutbox[0].msg as { text: string }).text).toContain("350");
    expect(r.status).toBe("open");
    expect(await q("select 1 from audit_log where action = 'ai.reply' and tenant_id = $1", [TENANT_A])).toHaveLength(1);
    const kinds = (await q("select distinct event_type from usage_events where conversation_id = $1", [r.conversation_id])).map((x) => x.event_type);
    expect(kinds).toEqual(expect.arrayContaining(["conversation_billed", "embedding_tokens", "wa_service_message"]));
  });

  it("hands a complaint to a human with a summary and sends nothing", async () => {
    const r = await send("wamid.ai2", "919100000002", "I was charged twice for my consultation, I want a refund");
    expect(mockOutbox).toHaveLength(0);
    expect(r).toMatchObject({ intent: "refund_complaint", status: "needs_human" });
    expect(r.summary).toContain("charged twice");
    expect(await q("select metadata->>'reason' as reason from audit_log where action = 'ai.handoff' and target_id = $1", [r.conversation_id])).toEqual([{ reason: "complaint_or_refund" }]);
  });

  it("hands off a low-confidence question the documents do not cover", async () => {
    const r = await send("wamid.ai3", "919100000003", "Do you offer hair transplant surgery?");
    expect(mockOutbox).toHaveLength(0);
    expect(r.status).toBe("needs_human");
  });

  it("does not reply when a human has taken over", async () => {
    await send("wamid.ai4", "919100000004", "What is the price of a CBC test?");
    expect(mockOutbox).toHaveLength(1);
    mockOutbox.length = 0;
    await q("update conversations set ai_paused = true where external_thread_id = '+919100000004'");
    await send("wamid.ai5", "919100000004", "And on Saturday?");
    expect(mockOutbox).toHaveLength(0);
  });
});

describe("service-role queries stay inside the tenant", () => {
  it("processInbound ignores a message id that belongs to another tenant", async () => {
    const { processInbound } = await import("./pipeline.ts");
    const [m] = await q(`select id from messages where tenant_id = $1 and direction = 'inbound' limit 1`, [TENANT_A]);
    expect(await processInbound({ tenantId: "10000000-0000-0000-0000-00000000000b", messageId: m.id })).toEqual({ outcome: "skipped", reason: "not_found" });
  });
});

describe("AI pipeline retries (reviewer findings 1 and 4)", () => {
  const send = async (id: string, from: string, text: string) => {
    expect((await POST(waRequest(waMessage(id, from, text)))).status).toBe(200);
    const [m] = await q("select conversation_id from messages where provider_message_id = $1", [id]);
    const [c] = await q("select status from conversations where id = $1", [m.conversation_id]);
    return { ...m, ...c };
  };
  it("a retry after the reply was sent neither re-runs the AI nor re-sends", async () => {
    const { processInbound } = await import("./pipeline.ts");
    const r = await send("wamid.retry1", "919100000011", "What is the price of a CBC test?");
    const [m] = await q(`select id from messages where provider_message_id = 'wamid.retry1'`);
    expect(mockOutbox).toHaveLength(1);
    const usageBefore = (await q(`select count(*)::int as n from usage_events where conversation_id = $1`, [r.conversation_id]))[0].n;
    expect(await processInbound({ tenantId: TENANT_A, messageId: m.id })).toEqual({ outcome: "skipped", reason: "already_sent" });
    expect(mockOutbox).toHaveLength(1);
    expect((await q(`select count(*)::int as n from usage_events where conversation_id = $1`, [r.conversation_id]))[0].n).toBe(usageBefore);
  });

  it("an AI reply with an unknown outcome is handed to a human, not dropped or re-sent", async () => {
    const spy = vi.spyOn(whatsappAdapter, "send").mockRejectedValueOnce(new Error("socket hang up"));
    const r = await send("wamid.retry2", "919100000012", "What is the price of a CBC test?");
    spy.mockRestore();
    expect(r.status).toBe("needs_human");
    expect(await q(`select metadata->>'reason' as reason from audit_log where action = 'ai.handoff' and target_id = $1`, [r.conversation_id])).toEqual([{ reason: "send_failed" }]);
    const { processInbound } = await import("./pipeline.ts");
    const [m] = await q(`select id from messages where provider_message_id = 'wamid.retry2'`);
    await q(`update conversations set status = 'open' where id = $1`, [r.conversation_id]); // a retry later
    expect(await processInbound({ tenantId: TENANT_A, messageId: m.id })).toEqual({ outcome: "handoff", reason: "send_outcome_unknown" });
    expect(mockOutbox).toHaveLength(0);
  });
});
