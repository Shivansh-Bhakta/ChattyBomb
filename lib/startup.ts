const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const hostOf = (url: string | undefined) => {
  try {
    return new URL(url ?? "").hostname; // APP_URL must be set explicitly: no "assume localhost" default
  } catch {
    return "";
  }
};

/** True only when APP_URL points at this machine and no hosting platform marker is present. */
export const isLocalDeployment = (e: Record<string, string | undefined>) => LOCAL_HOSTS.has(hostOf(e.APP_URL)) && !e.VERCEL;

/**
 * Problems that must stop the server from starting. Messages name variables, never values.
 */
export function startupProblems(e: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const mock = e.MOCK_MODE === "true";
  if (mock && e.NODE_ENV === "production") problems.push("MOCK_MODE=true is not allowed when NODE_ENV=production (mock login would be open)");
  if (mock && !isLocalDeployment(e)) problems.push("MOCK_MODE=true is only allowed on localhost (APP_URL must be set to http://localhost or 127.0.0.1, and not on Vercel)");
  // The chunks.embedding column is vector(1024); any other dimension breaks every insert.
  if (e.EMBEDDING_DIM !== undefined && e.EMBEDDING_DIM !== String(EMBEDDING_COLUMN_DIM)) problems.push(`EMBEDDING_DIM must be ${EMBEDDING_COLUMN_DIM} to match the chunks.embedding column`);
  if (e.NODE_ENV === "production") problems.push(...productionProblems(e));
  return problems;
}

export const EMBEDDING_COLUMN_DIM = 1024;
const token = /^\S{8,}$/; // present, no whitespace, not trivially short

/** Production must have every real-service setting, well formed. Only variable names are reported. */
function productionProblems(e: Record<string, string | undefined>): string[] {
  const p: string[] = [];
  const need = (name: string, ok: (v: string) => boolean, rule: string) => {
    const v = e[name];
    if (!v) p.push(`${name} is missing`);
    else if (!ok(v)) p.push(`${name} is malformed (${rule})`);
  };
  const url = (protocols: string[]) => (v: string) => { try { return protocols.includes(new URL(v).protocol); } catch { return false; } };
  need("DATABASE_URL", url(["postgres:", "postgresql:"]), "postgres:// URL");
  need("ENCRYPTION_KEY", (v) => /^[A-Za-z0-9+/]{43}=$/.test(v) && Buffer.from(v, "base64").length === 32, "base64 of exactly 32 bytes");
  need("EMBEDDING_DIM", (v) => v === String(EMBEDDING_COLUMN_DIM), `must be ${EMBEDDING_COLUMN_DIM}`);
  need("EMBEDDING_MODEL", (v) => /^[a-z0-9][a-z0-9.-]{2,63}$/.test(v), "a Voyage model id like voyage-3.5-lite");
  need("NEXT_PUBLIC_SUPABASE_URL", url(["https:"]), "https:// URL");
  need("NEXT_PUBLIC_SUPABASE_ANON_KEY", (v) => token.test(v), "non-empty token without spaces");
  need("SUPABASE_SERVICE_ROLE_KEY", (v) => token.test(v) && v !== e.NEXT_PUBLIC_SUPABASE_ANON_KEY, "non-empty token, different from the anon key");
  need("ANTHROPIC_API_KEY", (v) => /^sk-ant-\S{10,}$/.test(v), "starts with sk-ant-");
  need("VOYAGE_API_KEY", (v) => token.test(v), "non-empty token without spaces");
  // Without these, Inngest cannot verify that job calls come from Inngest.
  need("INNGEST_SIGNING_KEY", (v) => /^signkey-\S{10,}$/.test(v), "starts with signkey-");
  need("INNGEST_EVENT_KEY", (v) => token.test(v), "non-empty token without spaces");
  return p;
}

/** Throws (refusing to start) when any startup problem exists. */
export function assertStartup(e: Record<string, string | undefined>) {
  const problems = startupProblems(e);
  if (problems.length) throw new Error(`Refusing to start:\n- ${problems.join("\n- ")}`);
}
