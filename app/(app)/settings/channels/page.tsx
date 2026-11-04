import { checkEmailNow, connectImap, connectWhatsApp, setSlackChannel, setTemplates } from "@/app/actions/channels";
import { templatesOf } from "@/lib/channels/templates";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";

const MSG: Record<string, string> = {
  slack: "Slack connected.", slack_denied: "Slack install was cancelled.", slack_failed: "Slack install failed. Is this workspace already connected to another business?",
  gmail: "Gmail connected.", gmail_denied: "Google sign-in was cancelled.", gmail_failed: "Gmail connection failed.",
  templates_invalid: "Each template line must be: name,language,category (e.g. appointment_reminder,en,utility).",
  whatsapp: "WhatsApp connected.", whatsapp_failed: "WhatsApp test failed: check the Phone number ID and token (and that this number isn't used by another business).",
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
            {c.type === "whatsapp" && (
              <form action={setTemplates} className="space-y-1">
                <input type="hidden" name="channelId" value={c.id} />
                <p className="text-slate-500">Approved templates (one per line: name,language,category). Used outside the 24-hour window.</p>
                <textarea name="templates" rows={3} disabled={!owner} className="input font-mono" placeholder="appointment_reminder,en,utility"
                  defaultValue={templatesOf(c.config).map((t) => `${t.name},${t.language},${t.category}`).join("\n")} />
                {owner && <button className="btn-ghost">Save templates</button>}
              </form>
            )}
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
            <summary className="cursor-pointer text-sm font-medium">WhatsApp (manual setup)</summary>
            <ol className="my-2 list-decimal pl-5 text-sm text-slate-600">
              <li>In Meta&apos;s App Dashboard → WhatsApp → API Setup, copy the <b>Phone number ID</b>.</li>
              <li>Create a System User in Business Settings and generate a <b>permanent access token</b> with whatsapp_business_messaging.</li>
              <li>Set the webhook URL to <code>/api/webhooks/whatsapp</code> on this site and subscribe to <code>messages</code>.</li>
            </ol>
            <form action={connectWhatsApp} className="grid grid-cols-2 gap-2">
              <input name="phoneNumberId" required placeholder="Phone number ID" className="input" />
              <input name="displayPhone" required placeholder="+9198…" className="input" />
              <input name="wabaId" placeholder="Business Account ID (optional)" className="input" />
              <input name="accessToken" type="password" required placeholder="Permanent access token" className="input" autoComplete="off" />
              <button className="btn col-span-2">Test connection and save</button>
            </form>
          </details>
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
