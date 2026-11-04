import pg from "pg";
import { env } from "./env.ts";

export type Db = pg.PoolClient;
const g = globalThis as unknown as { __pool?: pg.Pool };
const pool = () => (g.__pool ??= new pg.Pool({ connectionString: env().DATABASE_URL, max: 5 }));

async function tx<T>(setup: (c: Db) => Promise<unknown>, fn: (c: Db) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await setup(c);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Runs as the signed-in user: Postgres RLS applies, exactly like Supabase PostgREST. */
export function asUser<T>(userId: string, fn: (c: Db) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  }, fn);
}

/** Bypasses RLS. Webhooks and jobs only, and every query must filter by tenant_id. */
export function asService<T>(fn: (c: Db) => Promise<T>): Promise<T> {
  return tx(async () => {}, fn);
}

export async function closePool() {
  await g.__pool?.end();
  g.__pool = undefined;
}
