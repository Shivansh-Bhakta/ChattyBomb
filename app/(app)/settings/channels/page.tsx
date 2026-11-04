import { setSlackChannel } from "@/app/actions/channels";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const MSG: Record<string, string> = { slack: "Slack connected.", slack_denied: "Slack install was cancelled.", slack_failed: "Slack install failed. Is this workspace already connected to another business?" };

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const channels = await asUser(me.id, async (db) => (await db.query(`select id, type, provider, status, external_id, config, last_error from channels order by type`)).rows);
  const owner = me.role === "owner";
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Channels</h1>
      {(sp.connected || sp.error) && <p className={`text-sm ${sp.error ? "text-red-600" : "text-emerald-700"}`}>{MSG[sp.connected ?? sp.error] ?? sp.error}</p>}
      <ul className="card divide-y divide-slate-100 p-0">
        {channels.length === 0 && <li className="p-4 text-sm text-slate-500">No channels connected yet.</li>}
        {channels.map((c) => (
          <li key={c.id} className="space-y-2 p-4 text-sm">
            <p><span className="font-medium capitalize">{c.type}</span> · {c.status} · <span className="text-slate-500">{c.config?.team_name ?? c.config?.display_phone ?? c.config?.address ?? c.external_id}</span></p>
            {c.last_error && <p className="text-red-600">{c.last_error}</p>}
            {c.type === "slack" && (
              <form action={setSlackChannel} className="flex items-center gap-2">
                <input type="hidden" name="channelId" value={c.id} />
                <span className="text-slate-500">Support channel (besides DMs):</span>
                <input name="slackChannel" defaultValue={c.config?.channel_id ?? ""} placeholder="C0123ABCD" className="input max-w-40" disabled={!owner} />
                {owner && <button className="btn-ghost">Save</button>}
              </form>
            )}
          </li>
        ))}
      </ul>
      {owner && <a href="/api/slack/install" className="btn inline-block">Connect Slack</a>}
    </main>
  );
}
