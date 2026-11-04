import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/slack/route";
import { decrypt } from "../crypto.ts";
import { asService, closePool } from "../db.ts";
import { ingestDocument } from "../ai/documents.ts";
import { mockOutbox } from "./mock.ts";
import { verifySlackSignature } from "./slack.ts";
import { exchangeCode, saveInstall } from "./slack-oauth.ts";
import { A_OWNER, B_OWNER, TENANT_A, TENANT_B } from "../../test/ids.ts";
import { readFileSync } from "node:fs";

afterAll(closePool);
beforeEach(() => { mockOutbox.length = 0; });
const q = async (sql: string, p: unknown[] = []) => (await asService((db) => db.query(sql, p))).rows;

const SECRET = "test-slack-secret";
function slackReq(body: unknown, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(body);
  const sig = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  return new Request("http://x/api/webhooks/slack", { method: "POST", body: raw, headers: { "x-slack-request-timestamp": String(ts), "x-slack-signature": sig } });
}
const msg = (event: Record<string, unknown>, team = "T_SUNRISE") => ({ type: "event_callback", team_id: team, event_id: `Ev${Math.random()}`, event: { type: "message", ...event } });

describe("Slack signature", () => {
  const raw = '{"a":1}', now = 1_800_000_000;
  const sig = (s: string, ts = now) => "v0=" + createHmac("sha256", s).update(`v0:${ts}:${raw}`).digest("hex");
  it("accepts valid, rejects wrong secret, tampered body, stale or missing timestamp", () => {
    expect(verifySlackSignature(raw, String(now), sig("k"), "k", now)).toBe(true);
    expect(verifySlackSignature(raw, String(now), sig("x"), "k", now)).toBe(false);
    expect(verifySlackSignature(raw + " ", String(now), sig("k"), "k", now)).toBe(false);
    expect(verifySlackSignature(raw, String(now - 301), sig("k", now - 301), "k", now)).toBe(false);
    expect(verifySlackSignature(raw, null, sig("k"), "k", now)).toBe(false);
    expect(verifySlackSignature(raw, String(now), null, "k", now)).toBe(false);
  });
  it("route rejects a bad signature and answers url_verification only when signed", async () => {
    expect((await POST(slackReq({ type: "url_verification", challenge: "c1" }, { secret: "nope" }))).status).toBe(401);
    const ok = await POST(slackReq({ type: "url_verification", challenge: "c1" }));
    expect(await ok.json()).toEqual({ challenge: "c1" });
  });
});

describe("Slack install and events", () => {
  beforeAll(async () => {
    const chId = await saveInstall(TENANT_A, A_OWNER, await exchangeCode("mock", "T_SUNRISE"));
    await q(`update channels set config = config || '{"channel_id":"CSUPPORT1"}' where id = $1`, [chId]);
    const bytes = new TextEncoder().encode(readFileSync(new URL("../../test/fixtures/sunrise-clinic.md", import.meta.url), "utf8"));
    await ingestDocument(TENANT_A, A_OWNER, { name: "faq.md", type: "text/markdown", bytes });
  });

  it("stores the bot token encrypted and refuses the same workspace for another tenant", async () => {
    const [ch] = await q("select tenant_id, status, credentials_encrypted from channels where type = 'slack' and external_id = 'T_SUNRISE'");
    expect(ch).toMatchObject({ tenant_id: TENANT_A, status: "connected" });
    expect(ch.credentials_encrypted).not.toContain("xoxb");
    expect(decrypt(ch.credentials_encrypted)).toBe("xoxb-mock");
    await expect(saveInstall(TENANT_B, B_OWNER, await exchangeCode("mock", "T_SUNRISE"))).rejects.toThrow(/another business/);
  });

  it("answers a DM in the DM and a support-channel message in its thread", async () => {
    await POST(slackReq(msg({ channel: "D111", channel_type: "im", user: "U1", text: "What is the price of a CBC test?", ts: "1700000000.000100" })));
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0]).toMatchObject({ channel: "slack", target: { threadId: "D111" } });
    await POST(slackReq(msg({ channel: "CSUPPORT1", channel_type: "channel", user: "U2", text: "What is the price of a CBC test?", ts: "1700000001.000200" })));
    expect(mockOutbox[1].target.threadId).toBe("CSUPPORT1:1700000001.000200");
  });

  it("ignores bot messages, other channels, other workspaces and duplicate deliveries", async () => {
    const before = (await q("select count(*)::int as n from messages"))[0].n;
    await POST(slackReq(msg({ channel: "D111", user: "U1", text: "loop?", ts: "1700000002.1", bot_id: "B1" })));
    await POST(slackReq(msg({ channel: "CRANDOM", channel_type: "channel", user: "U1", text: "hi", ts: "1700000003.1" })));
    await POST(slackReq(msg({ channel: "D999", user: "U9", text: "hi", ts: "1700000004.1" }, "T_UNKNOWN")));
    expect((await q("select count(*)::int as n from messages"))[0].n).toBe(before);
    const dm = msg({ channel: "D222", user: "U3", text: "hello there", ts: "1700000005.1" });
    await POST(slackReq(dm));
    await POST(slackReq(dm));
    expect(await q("select 1 from messages where provider_message_id = 'D222:1700000005.1'")).toHaveLength(1);
  });
});
