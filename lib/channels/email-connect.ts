import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { z } from "zod";
import { encrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env, secret } from "../env.ts";
import { gmailFetch, type imapCreds } from "./email.ts";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
// Restricted scopes: production use needs Google verification (docs/EMAIL_SETUP.md).
export const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
const redirectUri = () => `${env().APP_URL}/api/google/oauth`;

export function googleInstallUrl(state: string) {
  const p = new URLSearchParams({ client_id: secret("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri(), response_type: "code", scope: GMAIL_SCOPES, access_type: "offline", prompt: "consent", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Code → refresh token + mailbox address. MOCK_MODE returns a fake mailbox. */
export async function exchangeGoogleCode(code: string, mockAddress = "support@mock.test") {
  if (env().MOCK_MODE) return { refreshToken: "mock-refresh", address: mockAddress };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: secret("GOOGLE_CLIENT_ID"), client_secret: secret("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
  if (!j.refresh_token) throw new Error(`Google OAuth failed: ${j.error ?? "no refresh token"}`);
  const profile = (await gmailFetch(j.refresh_token, "profile")) as { emailAddress: string };
  return { refreshToken: j.refresh_token, address: profile.emailAddress.toLowerCase() };
}

/** Logs in to IMAP and SMTP with the given settings ("Test connection"). MOCK_MODE always succeeds. */
export async function testImap(c: z.infer<typeof imapCreds>) {
  if (env().MOCK_MODE) return;
  const imap = new ImapFlow({ host: c.imap.host, port: c.imap.port, secure: c.imap.secure, auth: { user: c.user, pass: c.pass }, logger: false });
  await imap.connect();
  await imap.logout();
  await nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: { user: c.user, pass: c.pass } }).verify();
}

/** Stores an email channel with encrypted credentials. An address connected to another tenant is refused. */
export async function saveEmailChannel(tenantId: string, userId: string, provider: "gmail" | "imap", address: string, creds: object) {
  return asService(async (db) => {
    const { rows: [ch] } = await db.query(
      `insert into channels (tenant_id, type, provider, status, external_id, config, credentials_encrypted, connected_by, connected_at)
       values ($1, 'email', $2, 'connected', $3, $4, $5, $6, now())
       on conflict (type, external_id) do update set provider = excluded.provider, status = 'connected', config = excluded.config,
         credentials_encrypted = excluded.credentials_encrypted, connected_by = excluded.connected_by, connected_at = now(), last_error = null
       where channels.tenant_id = excluded.tenant_id
       returning id`,
      [tenantId, provider, address.toLowerCase(), { address: address.toLowerCase() }, encrypt(JSON.stringify(creds)), userId],
    );
    if (!ch) throw new Error("this email address is connected to another business");
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata) values ($1, 'user', $2, 'channel.connect', 'channel', $3, $4)`,
      [tenantId, userId, ch.id, { type: "email", provider, address }],
    );
    return ch.id as string;
  });
}
