import { applyRazorpayEvent, eventIdOf, verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { env } from "@/lib/env";
import { rejectUnverified, tooLarge } from "@/lib/rate-limit";

const MAX_BODY = 1_000_000;

export async function POST(req: Request) {
  const webhookSecret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response("billing not configured", { status: 503 });
  if (tooLarge(req.headers, MAX_BODY)) return new Response("too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
  if (!verifyRazorpaySignature(raw, req.headers.get("x-razorpay-signature"), webhookSecret)) return rejectUnverified("razorpay", req.headers, 401, "invalid signature");
  try {
    await applyRazorpayEvent(raw, eventIdOf(raw, req.headers));
  } catch (e) {
    if ((e as Error).name === "ZodError" || e instanceof SyntaxError) return new Response("invalid payload", { status: 400 });
    throw e; // 500 → Razorpay retries; the dedupe row was rolled back
  }
  return new Response("ok", { status: 200 });
}
