import { encrypt } from "../crypto.ts";
import { asService } from "../db.ts";
import { env, secret } from "../env.ts";

export const SLACK_SCOPES = "chat:write,im:history,channels:history,groups:history";
export const STATE_COOKIE = "slack_oauth_state";
const redirectUri = () => `${env().APP_URL}/api/slack/oauth`;

export function installUrl(state: string) {
  const p = new URLSearchParams({ client_id: secret("SLACK_CLIENT_ID"), scope: SLACK_SCOPES, redirect_uri: redirectUri(), state });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

type Install = { accessToken: string; teamId: string; teamName: string; botUserId: string };

/** Exchanges the OAuth code for a bot token. MOCK_MODE returns a fake workspace. */
export async function exchangeCode(code: string, mockTeamId = "T_MOCK"): Promise<Install> {
  if (env().MOCK_MODE) return { accessToken: "xoxb-mock", teamId: mockTeamId, teamName: "Mock Workspace", botUserId: "U_MOCK_BOT" };
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: secret("SLACK_CLIENT_ID"), client_secret: secret("SLACK_CLIENT_SECRET"), code, redirect_uri: redirectUri() }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; access_token?: string; team?: { id: string; name: string }; bot_user_id?: string };
  if (!j.ok || !j.access_token || !j.team?.id) throw new Error(`Slack OAuth failed: ${j.error ?? res.status}`);
  return { accessToken: j.access_token, teamId: j.team.id, teamName: j.team.name, botUserId: j.bot_user_id ?? "" };
}

/** Stores the install encrypted. A workspace already connected to another tenant is refused. */
export async function saveInstall(tenantId: string, userId: string, i: Install) {
  return asService(async (db) => {
    const { rows: [ch] } = await db.query(
      `insert into channels (tenant_id, type, provider, status, external_id, config, credentials_encrypted, connected_by, connected_at)
       values ($1, 'slack', 'slack', 'connected', $2, $3, $4, $5, now())
       on conflict (type, external_id) do update set status = 'connected', credentials_encrypted = excluded.credentials_encrypted,
         config = channels.config || excluded.config, connected_by = excluded.connected_by, connected_at = now(), last_error = null
       where channels.tenant_id = excluded.tenant_id
       returning id`,
      [tenantId, i.teamId, { team_name: i.teamName, bot_user_id: i.botUserId }, encrypt(i.accessToken), userId],
    );
    if (!ch) throw new Error("this Slack workspace is connected to another business");
    await db.query(
      `insert into audit_log (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata)
       values ($1, 'user', $2, 'channel.connect', 'channel', $3, $4)`,
      [tenantId, userId, ch.id, { type: "slack", team_id: i.teamId }],
    );
    return ch.id as string;
  });
}
