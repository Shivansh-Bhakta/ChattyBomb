import type { Db } from "../db.ts";
import { env } from "../env.ts";
import { record } from "../metering.ts";
import { embed, toPgVector } from "./embed.ts";

/** Top-k chunks for one tenant by cosine similarity. Always tenant-filtered (service-role callers). */
export async function retrieve(db: Db, tenantId: string, query: string, k = 5, conversationId: string | null = null) {
  const { vectors: [v], tokens } = await embed([query], "query");
  await record(db, { tenantId, conversationId, eventType: "embedding_tokens", quantity: tokens, rateKey: `voyage:${env().EMBEDDING_MODEL}:per_mtok`, model: env().EMBEDDING_MODEL });
  const { rows } = await db.query(
    `select content, 1 - (embedding <=> $2::vector) as score from chunks
      where tenant_id = $1 order by embedding <=> $2::vector limit $3`,
    [tenantId, toPgVector(v), k],
  );
  return rows.map((r) => ({ content: r.content as string, score: Number(r.score) }));
}
