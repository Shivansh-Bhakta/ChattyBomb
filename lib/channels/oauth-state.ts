import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "../env.ts";

/** CSRF state for OAuth installs: random value in a short-lived httpOnly cookie, compared in constant time. */
export async function newState(name: string) {
  const state = randomBytes(32).toString("hex");
  (await cookies()).set(name, state, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/api", maxAge: 600 });
  return state;
}

export async function checkState(name: string, given: string | null) {
  const store = await cookies();
  const expected = Buffer.from(store.get(name)?.value ?? ""), got = Buffer.from(given ?? "");
  store.delete(name);
  return expected.length > 0 && expected.length === got.length && timingSafeEqual(expected, got);
}
