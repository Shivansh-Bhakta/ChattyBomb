import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as waPOST } from "@/app/api/webhooks/whatsapp/route";
import { POST as slackPOST } from "@/app/api/webhooks/slack/route";
import { AUTH_POSTS_PER_10_MIN, proxy } from "@/proxy";
import { closePool } from "./db.ts";
import { hit, resetRateLimits, WEBHOOK_FAILURES_PER_MIN } from "./rate-limit.ts";
import { waMessage, waRequest } from "../test/whatsapp.ts";

afterAll(closePool);
beforeEach(resetRateLimits);
const fromIp = (req: Request, ip: string) => { req.headers.set("x-forwarded-for", ip); return req; };

describe("rate limit helper", () => {
  it("allows up to the limit per window, then resets", () => {
    for (let i = 0; i < 3; i++) expect(hit("k", 3, 1000, 0).ok).toBe(true);
    expect(hit("k", 3, 1000, 500)).toEqual({ ok: false, retryAfterS: 1 });
    expect(hit("k", 3, 1000, 1000).ok).toBe(true);
    expect(hit("other", 3, 1000, 500).ok).toBe(true);
  });
});

describe("webhook rate limiting", () => {
  it("returns 429 after repeated bad signatures from one IP, but still accepts valid signed requests from it", async () => {
    const statuses = [];
    for (let i = 0; i <= WEBHOOK_FAILURES_PER_MIN; i++) statuses.push((await waPOST(fromIp(waRequest(waMessage(`wamid.rl${i}`, "919300000001", "hi"), "bad-secret"), "6.6.6.6"))).status);
    expect(statuses.slice(0, WEBHOOK_FAILURES_PER_MIN).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect((await waPOST(fromIp(waRequest(waMessage("wamid.rl-valid", "919300000001", "hi")), "6.6.6.6"))).status).toBe(200);
  });

  it("never limits valid signed traffic at normal (or high) volume", async () => {
    for (let i = 0; i < 150; i++) {
      const res = await waPOST(fromIp(waRequest({ object: "whatsapp_business_account", entry: [] }), "31.13.0.1"));
      expect(res.status).toBe(200);
    }
    const ts = Math.floor(Date.now() / 1000), raw = JSON.stringify({ type: "url_verification", challenge: "c" });
    const sig = "v0=" + createHmac("sha256", "test-slack-secret").update(`v0:${ts}:${raw}`).digest("hex");
    for (let i = 0; i < 60; i++) {
      const res = await slackPOST(new Request("http://x", { method: "POST", body: raw, headers: { "x-slack-request-timestamp": String(ts), "x-slack-signature": sig, "x-forwarded-for": "3.3.3.3" } }));
      expect(res.status).toBe(200);
    }
  });

  it("refuses oversized bodies from the Content-Length header", async () => {
    const req = new Request("http://x", { method: "POST", body: "{}", headers: { "content-length": "5000000" } });
    expect((await waPOST(req)).status).toBe(413);
  });
});

describe("login rate limiting", () => {
  const post = (path: string, ip: string) => proxy(new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "x-forwarded-for": ip } }));
  it("returns 429 after too many login/signup posts from one IP, per IP, and never for GET", async () => {
    for (let i = 0; i < AUTH_POSTS_PER_10_MIN; i++) expect((await post(i % 2 ? "/login" : "/signup", "9.9.9.9")).status).not.toBe(429);
    const blocked = await post("/login", "9.9.9.9");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await post("/login", "8.8.8.8")).status).not.toBe(429);
    expect((await proxy(new NextRequest("http://localhost/login", { headers: { "x-forwarded-for": "9.9.9.9" } }))).status).not.toBe(429);
  });
});
