/**
 * Fixed-window counters in process memory.
 * shortcut: per server instance (serverless instances don't share counts), move to Postgres/Redis if abuse is seen across instances.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  if (buckets.size > 50_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, (b = { count: 0, resetAt: now + windowMs }));
  b.count++;
  return { ok: b.count <= limit, retryAfterS: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export const resetRateLimits = () => buckets.clear();

/** Client IP as set by the hosting proxy (Vercel overwrites x-forwarded-for). */
export const clientIp = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

export const tooMany = (retryAfterS: number) => new Response("too many requests", { status: 429, headers: { "retry-after": String(retryAfterS) } });

/** Webhooks: only requests that FAIL verification are limited, so valid signed provider traffic is never blocked. */
export const WEBHOOK_FAILURES_PER_MIN = 30;
export function rejectUnverified(provider: string, h: Headers, status: number, message: string) {
  const r = hit(`webhook-fail:${provider}:${clientIp(h)}`, WEBHOOK_FAILURES_PER_MIN, 60_000);
  return r.ok ? new Response(message, { status }) : tooMany(r.retryAfterS);
}

/** Oversized bodies are refused from the header before reading. */
export const tooLarge = (h: Headers, max: number) => Number(h.get("content-length") ?? 0) > max;
