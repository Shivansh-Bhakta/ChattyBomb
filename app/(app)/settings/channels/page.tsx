import { checkEmailNow, connectImap, setSlackChannel } from "@/app/actions/channels";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const MSG: Record<string, string> = {
  slack: "Slack connected.", slack_denied: "Slack install was cancelled.", slack_failed: "Slack install failed. Is this workspace already connected to another business?",
  gmail: "Gmail connected.", gmail_denied: "Google sign-in was cancelled.", gmail_failed: "Gmail connection failed.",
  imap: "Email connected.", imap_invalid: "Please fill in every email field.", imap_failed: "Could not log in to IMAP/SMTP with those settings.",
};

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
            {c.type === "email" && (
              <form action={checkEmailNow}>
                <input type="hidden" name="channelId" value={c.id} />
                <button className="btn-ghost">Check email now</button>
                <span className="ml-2 text-slate-500">({c.provider}; checked automatically every 2 minutes)</span>
              </form>
            )}
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
      {owner && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <a href="/api/slack/install" className="btn inline-block">Connect Slack</a>
            <a href="/api/google/install" className="btn inline-block">Connect Gmail</a>
          </div>
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium">Other email (IMAP/SMTP with an app password)</summary>
            <p className="my-2 text-sm text-slate-500">Create an app password in your email provider&apos;s security settings. Never use your main password.</p>
            <form action={connectImap} className="grid grid-cols-2 gap-2">
              <input name="address" type="email" required placeholder="support@yourbusiness.in" className="input col-span-2" />
              <input name="user" required placeholder="Login (usually the address)" className="input" />
              <input name="pass" type="password" required placeholder="App password" className="input" />
              <input name="imapHost" required placeholder="IMAP host (imap.zoho.in)" className="input" />
              <input name="imapPort" required defaultValue="993" className="input" />
              <input name="smtpHost" required placeholder="SMTP host (smtp.zoho.in)" className="input" />
              <input name="smtpPort" required defaultValue="465" className="input" />
              <button className="btn col-span-2">Test connection and save</button>
            </form>
          </details>
        </div>
      )}
    </main>
  );
}
