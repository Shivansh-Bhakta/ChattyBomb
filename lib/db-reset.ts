import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = join(import.meta.dirname, "..", "supabase");

/** Rebuilds a LOCAL database: shim + migrations + seed. Refuses non-local hosts. */
export async function resetLocalDb(url: string, { seed = true } = {}) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`refusing to reset non-local database (${host})`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;");
    await client.query(readFileSync(join(root, "local-shim.sql"), "utf8"));
    for (const f of readdirSync(join(root, "migrations")).sort()) {
      await client.query(readFileSync(join(root, "migrations", f), "utf8"));
    }
    if (seed) await client.query(readFileSync(join(root, "seed.sql"), "utf8"));
  } finally {
    await client.end();
  }
}
