/**
 * Error reporting: one structured JSON line per error (Vercel log drains / any log search can alert on
 * `"level":"error"`), plus an optional POST to ERROR_WEBHOOK_URL (e.g. a Slack incoming webhook).
 * Never sends request headers, cookies or bodies; secret-looking strings are redacted.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g, /xox[abprs]-[A-Za-z0-9-]+/g, /EAA[A-Za-z0-9]{10,}/g, /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, /(password|pass|secret|token|key)=([^&\s]+)/gi, /postgres(ql)?:\/\/[^@\s]+@/gi,
];

export function redact(text: string) {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, (m, k) => (typeof k === "string" && /=/.test(m) ? `${k}=[redacted]` : "[redacted]")), text);
}

export async function reportError(error: unknown, context: { path?: string; method?: string; kind?: string } = {}) {
  const e = error as { message?: string; name?: string; digest?: string; stack?: string };
  const event = {
    level: "error", at: new Date().toISOString(), kind: context.kind ?? "request",
    path: context.path?.split("?")[0], method: context.method, name: e?.name, digest: e?.digest,
    message: redact(String(e?.message ?? error)).slice(0, 500),
    stack: redact(String(e?.stack ?? "")).split("\n").slice(0, 6).join("\n"),
  };
  console.error(JSON.stringify(event));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return event;
  await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `ChattyBomb error ${event.method ?? ""} ${event.path ?? event.kind}: ${event.message}` }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {}); // monitoring must never take the app down
  return event;
}
