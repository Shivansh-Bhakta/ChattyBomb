"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ALLOWED_TYPES, ingestDocument, MAX_BYTES } from "@/lib/ai/documents";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const byExt: Record<string, (typeof ALLOWED_TYPES)[number]> = { pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv" };

export async function uploadDocument(form: FormData) {
  const me = await requireMember();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/documents?error=empty");
  if (file.size > MAX_BYTES) redirect("/documents?error=size");
  // Trust the extension-derived type only if the browser agrees or sent nothing specific.
  const type = byExt[file.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!type || (file.type && file.type !== type && file.type !== "application/octet-stream")) redirect("/documents?error=type");
  try {
    await ingestDocument(me.tenantId, me.id, { name: file.name, type, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (e) {
    console.error("[uploadDocument]", (e as Error).message);
    redirect("/documents?error=failed");
  }
  revalidatePath("/documents");
}

export async function deleteDocument(form: FormData) {
  const me = await requireMember();
  const id = z.guid().parse(form.get("documentId"));
  // shortcut: leaves the original file in Storage; per-tenant deletion (M9) wipes the whole folder.
  await asUser(me.id, (db) => db.query("delete from documents where id = $1", [id])); // chunks cascade
  revalidatePath("/documents");
}
