import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { asService } from "../db.ts";
import { env, secret } from "../env.ts";
import { record } from "../metering.ts";
import { chunkText } from "./chunk.ts";
import { embed, toPgVector } from "./embed.ts";

export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["application/pdf", "text/plain", "text/markdown", "text/csv"] as const;

async function extractText(bytes: Uint8Array, mime: string) {
  if (mime !== "application/pdf") return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { extractText: pdf } = await import("unpdf");
  const { text } = await pdf(bytes, { mergePages: true });
  return text;
}

async function store(path: string, bytes: Uint8Array, mime: string) {
  if (env().MOCK_MODE) {
    const file = join(process.cwd(), ".mock-storage", path);
    await mkdir(dirname(file), { recursive: true });
    return writeFile(file, bytes);
  }
  const supabase = createClient(env().NEXT_PUBLIC_SUPABASE_URL!, secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { error } = await supabase.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

/**
 * Stores, chunks and embeds one document for a tenant. Caller validates type/size and membership.
 * shortcut: runs inline in the upload request (fine for <10 MB text/PDF), move to an Inngest job if uploads time out.
 */
export async function ingestDocument(tenantId: string, userId: string, file: { name: string; type: string; bytes: Uint8Array }) {
  const { rows: [doc] } = await asService((db) =>
    db.query(
      `insert into documents (tenant_id, title, storage_path, mime_type, size_bytes, status, uploaded_by)
       values ($1, $2, '', $3, $4, 'processing', $5) returning id`,
      [tenantId, file.name.slice(0, 200), file.type, file.bytes.length, userId],
    ),
  );
  const path = `tenants/${tenantId}/${doc.id}`;
  try {
    await store(path, file.bytes, file.type);
    const chunks = chunkText(await extractText(file.bytes, file.type));
    if (!chunks.length) throw new Error("no text found in document");
    const { vectors, tokens } = await embed(chunks, "document");
    await asService(async (db) => {
      for (const [i, content] of chunks.entries()) {
        await db.query(
          `insert into chunks (tenant_id, document_id, idx, content, token_count, embedding) values ($1, $2, $3, $4, $5, $6::vector)`,
          [tenantId, doc.id, i, content, Math.ceil(content.length / 4), toPgVector(vectors[i])],
        );
      }
      await db.query(`update documents set status = 'ready', storage_path = $2 where id = $1`, [doc.id, path]);
      await record(db, { tenantId, eventType: "embedding_tokens", quantity: tokens, rateKey: `voyage:${env().EMBEDDING_MODEL}:per_mtok`, model: env().EMBEDDING_MODEL, meta: { document_id: doc.id } });
    });
  } catch (e) {
    await asService((db) => db.query(`update documents set status = 'failed', error = $2, storage_path = $3 where id = $1`, [doc.id, (e as Error).message.slice(0, 500), path]));
    throw e;
  }
  return doc.id as string;
}
