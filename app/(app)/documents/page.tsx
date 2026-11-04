import { deleteDocument, uploadDocument } from "@/app/actions/documents";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const ERRORS: Record<string, string> = {
  empty: "Choose a file first.", size: "Files must be under 10 MB.", type: "Only PDF, TXT, MD and CSV files are supported.",
  failed: "Could not process that file. Is it a text-based (not scanned) PDF?",
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireMember();
  const { error } = await searchParams;
  const docs = await asUser(me.id, async (db) => (await db.query(
    `select d.id, d.title, d.status, d.error, d.size_bytes, d.created_at, count(c.id)::int as chunks
       from documents d left join chunks c on c.document_id = d.id group by d.id order by d.created_at desc`,
  )).rows);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Knowledge base</h1>
      <p className="text-sm text-slate-600">The AI answers customers only from these documents: FAQs, price lists, timings, policies.</p>
      {error && <p className="text-sm text-red-600">{ERRORS[error] ?? "Upload failed."}</p>}
      <form action={uploadDocument} className="card flex items-center gap-3">
        <input type="file" name="file" accept=".pdf,.txt,.md,.csv" required className="text-sm" />
        <button className="btn ml-auto">Upload</button>
      </form>
      <ul className="card divide-y divide-slate-100 p-0">
        {docs.length === 0 && <li className="p-4 text-sm text-slate-500">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 p-4 text-sm">
            <div className="mr-auto">
              <p className="font-medium">{d.title}</p>
              <p className="text-slate-500">{d.status}{d.status === "ready" ? ` · ${d.chunks} chunks` : ""}{d.error ? ` · ${d.error}` : ""}</p>
            </div>
            <form action={deleteDocument}>
              <input type="hidden" name="documentId" value={d.id} />
              <button className="btn-ghost">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
