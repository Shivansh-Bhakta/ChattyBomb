import Link from "next/link";
import { addNote, assign, sendReply, setAiPaused, setStatus } from "@/app/actions/inbox";
import { adapterFor } from "@/lib/channels";
import { LiveRefresh } from "@/components/live-refresh";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { CHANNELS, filtersSchema, getThread, listConversations, STATUSES } from "@/lib/inbox";

const label = (s: string) => s.replaceAll("_", " ");
const badge: Record<string, string> = { whatsapp: "bg-green-100 text-green-800", slack: "bg-purple-100 text-purple-800", email: "bg-blue-100 text-blue-800" };
const statusColor: Record<string, string> = { open: "text-slate-600", waiting_on_customer: "text-amber-700", needs_human: "text-red-700 font-semibold", resolved: "text-slate-400" };
const time = (d: Date) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const f = filtersSchema.parse(sp);
  const [list, thread] = await asUser(me.id, async (db) => {
    const t = f.c ? await getThread(db, f.c) : null;
    if (t?.conv.unread_count) await db.query("update conversations set unread_count = 0 where id = $1", [f.c]);
    return [await listConversations(db, f), t] as const;
  });
  const keep = (c: string) => `/inbox?${new URLSearchParams({ ...(f.status && { status: f.status }), ...(f.channel && { channel: f.channel }), ...(f.q && { q: f.q }), c })}`;

  return (
    <div className="flex h-full">
      <LiveRefresh />
      <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
        <form className="space-y-2 border-b border-slate-200 p-3">
          <input name="q" defaultValue={f.q} placeholder="Search name, phone or message" className="input" />
          <div className="flex gap-2">
            <select name="status" defaultValue={f.status ?? ""} className="input">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <select name="channel" defaultValue={f.channel ?? ""} className="input">
              <option value="">All channels</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn-ghost">Go</button>
          </div>
        </form>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && <li className="p-4 text-sm text-slate-500">No conversations.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <Link href={keep(c.id)} className={`block border-b border-slate-100 px-3 py-2 hover:bg-slate-50 ${c.id === f.c ? "bg-emerald-50" : ""}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`rounded px-1.5 text-xs ${badge[c.channel]}`}>{c.channel}</span>
                  <span className="font-medium">{c.contact_name || c.contact_handle}</span>
                  {c.unread_count > 0 && <span className="ml-auto rounded-full bg-emerald-600 px-1.5 text-xs text-white">{c.unread_count}</span>}
                </div>
                <p className="truncate text-sm text-slate-600">{c.last_body}</p>
                <p className="text-xs"><span className={statusColor[c.status]}>{label(c.status)}</span> · {c.assignee_name ?? "unassigned"}{c.ai_paused ? " · AI paused" : ""} · {time(c.last_message_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!thread ? (
          <p className="m-auto text-slate-500">{f.c ? "Conversation not found." : "Pick a conversation."}</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white p-3 text-sm">
              <div className="mr-auto">
                <p className="font-semibold">{thread.conv.contact_name}</p>
                <p className="text-slate-500">{thread.conv.phone ?? thread.conv.email} · {thread.conv.channel}</p>
              </div>
              <form action={setStatus} className="flex gap-1">
                <input type="hidden" name="conversationId" value={thread.conv.id} />
                <select name="status" defaultValue={thread.conv.status} className="input">
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <button className="btn-ghost">Set</button>
              </form>
              <form action={assign} className="flex gap-1">
                <input type="hidden" name="conversationId" value={thread.conv.id} />
                <select name="assigneeId" defaultValue={thread.conv.assignee_id ?? ""} className="input">
                  <option value="">Unassigned</option>
                  {thread.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn-ghost">Assign</button>
              </form>
              <form action={setAiPaused}>
                <input type="hidden" name="conversationId" value={thread.conv.id} />
                <input type="hidden" name="paused" value={String(!thread.conv.ai_paused)} />
                <button className={thread.conv.ai_paused ? "btn" : "btn-ghost"}>{thread.conv.ai_paused ? "Hand back to AI" : "Take over from AI"}</button>
              </form>
            </header>
            {thread.conv.summary && <p className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-800">Handoff summary: {thread.conv.summary}</p>}
            <ol className="flex-1 space-y-2 overflow-y-auto p-4">
              {thread.messages.map((m) => (
                <li key={m.id} className={`max-w-xl rounded-lg px-3 py-2 text-sm ${m.direction === "note" ? "mx-auto border border-amber-200 bg-amber-50" : m.direction === "inbound" ? "bg-white shadow-sm" : "ml-auto bg-emerald-100"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.direction === "note" ? `Note · ${m.sender_name}` : m.sender_type === "ai" ? "AI" : m.sender_name ?? (m.direction === "inbound" ? "Customer" : "Agent")}
                    {m.direction === "outbound" && ` · ${m.status}`} · {time(m.created_at)}
                  </p>
                </li>
              ))}
            </ol>
            {sp.error && <p className="bg-red-50 p-2 text-sm text-red-700">{sp.error === "window" ? "The 24-hour WhatsApp window is closed: only approved templates can be sent." : "Sending failed. Check the channel connection."}</p>}
            {adapterFor(thread.conv.channel).canSendFreeform(thread.conv) ? (
              <form action={sendReply} className="flex gap-2 border-t border-slate-200 bg-white p-3">
                <input type="hidden" name="conversationId" value={thread.conv.id} />
                <textarea name="body" required maxLength={4096} rows={2} placeholder={`Reply on ${thread.conv.channel}`} className="input" />
                <button className="btn">Send</button>
              </form>
            ) : (
              <p className="border-t border-slate-200 bg-amber-50 p-3 text-sm text-amber-800">24-hour window closed. Only approved WhatsApp templates can be sent (coming in M8).</p>
            )}
            <form action={addNote} className="flex gap-2 border-t border-slate-200 bg-white p-3">
              <input type="hidden" name="conversationId" value={thread.conv.id} />
              <input name="body" required maxLength={5000} placeholder="Internal note (not sent to the customer)" className="input" />
              <button className="btn-ghost">Add note</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
