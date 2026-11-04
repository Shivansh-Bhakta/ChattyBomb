import { ImapFlow } from "imapflow";
import { decrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env } from "../env.ts";
import { gmailCreds, gmailFetch, imapCreds, parseEmail } from "./email.ts";
import { ingestMessages } from "./inbound.ts";
import { mockInbox } from "./mock.ts";
import type { InboundMessage } from "./types.ts";

type Cursor = { history_id?: string; last_uid?: number };

/** Fetches raw emails newer than the cursor. First run only records the cursor (old mail is not answered). */
async function fetchNew(provider: string, address: string, credsEnc: string | null, cursor: Cursor): Promise<{ raws: (string | Buffer)[]; cursor: Cursor }> {
  if (env().MOCK_MODE) return { raws: mockInbox.get(address)?.splice(0) ?? [], cursor };
  if (!credsEnc) throw new Error("email channel has no credentials");
  const creds = JSON.parse(decrypt(credsEnc));
  if (provider === "gmail") {
    const { refresh_token } = gmailCreds.parse(creds);
    if (!cursor.history_id) return { raws: [], cursor: { history_id: String(((await gmailFetch(refresh_token, "profile")) as { historyId: string }).historyId) } };
    const h = (await gmailFetch(refresh_token, `history?startHistoryId=${encodeURIComponent(cursor.history_id)}&historyTypes=messageAdded&labelId=INBOX`)) as
      { historyId: string; history?: { messagesAdded?: { message: { id: string } }[] }[] };
    const ids = [...new Set((h.history ?? []).flatMap((x) => x.messagesAdded ?? []).map((a) => a.message.id))].slice(0, 50);
    const raws = await Promise.all(ids.map(async (id) => Buffer.from(((await gmailFetch(refresh_token, `messages/${id}?format=raw`)) as { raw: string }).raw, "base64url")));
    return { raws, cursor: { history_id: String(h.historyId) } };
  }
  const c = imapCreds.parse(creds);
  const imap = new ImapFlow({ host: c.imap.host, port: c.imap.port, secure: c.imap.secure, auth: { user: c.user, pass: c.pass }, logger: false });
  await imap.connect();
  try {
    const box = await imap.mailboxOpen("INBOX", { readOnly: true });
    if (cursor.last_uid === undefined) return { raws: [], cursor: { last_uid: Number(box.uidNext) - 1 } };
    const raws: Buffer[] = [];
    let last = cursor.last_uid;
    for await (const m of imap.fetch(`${cursor.last_uid + 1}:*`, { uid: true, source: true }, { uid: true })) {
      if (m.uid <= cursor.last_uid || !m.source) continue; // "N:*" returns the last message even when nothing is newer
      raws.push(m.source);
      last = Math.max(last, m.uid);
      if (raws.length >= 50) break;
    }
    return { raws, cursor: { last_uid: last } };
  } finally {
    await imap.logout().catch(() => {});
  }
}

/** Polls one email channel and ingests new mail. Errors mark the channel so the owner sees them. */
export async function pollEmail(channelId: string) {
  const { rows: [ch] } = await asService((db) => db.query( // scope: platform-job (callers: cron, or checkEmailNow after an RLS check)
    `select id, tenant_id, provider, external_id, config, credentials_encrypted from channels where id = $1 and type = 'email' and status in ('connected', 'error')`, [channelId]));
  if (!ch) return { ingested: 0 };
  try {
    const { raws, cursor } = await fetchNew(ch.provider, ch.external_id, ch.credentials_encrypted, ch.config);
    const parsed = (await Promise.all(raws.map((r) => parseEmail(r, ch.external_id).catch(() => null)))).filter((m): m is InboundMessage => !!m);
    const stored = await ingestMessages("email", "email", parsed);
    await asService((db) => db.query(`update channels set config = config || $2, status = 'connected', last_error = null where id = $1 and tenant_id = $3`, [ch.id, cursor, ch.tenant_id])); // scope: tenant
    return { ingested: stored.length };
  } catch (e) {
    await asService((db) => db.query(`update channels set status = 'error', last_error = $2 where id = $1 and tenant_id = $3`, [ch.id, (e as Error).message.slice(0, 300), ch.tenant_id])); // scope: tenant
    throw e;
  }
}

export async function pollAllEmail() {
  const { rows } = await asService((db) => db.query(`select id from channels where type = 'email' and status in ('connected', 'error')`)); // scope: platform-job
  for (const r of rows) await pollEmail(r.id).catch((e) => console.error("[email poll]", r.id, (e as Error).message));
}
