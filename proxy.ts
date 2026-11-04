import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, hit, tooMany } from "./lib/rate-limit";

export const AUTH_POSTS_PER_10_MIN = 20;

/** Rate-limits login/signup submissions, then refreshes the Supabase auth session (skipped in mock mode). */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (request.method === "POST" && (path === "/login" || path === "/signup")) {
    const r = hit(`auth:${clientIp(request.headers)}`, AUTH_POSTS_PER_10_MIN, 10 * 60_000);
    if (!r.ok) return tooMany(r.retryAfterS);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.MOCK_MODE === "true" || !url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest).*)"] };
