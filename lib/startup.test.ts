import { describe, expect, it, vi } from "vitest";
import { assertStartup, startupProblems } from "./startup.ts";

describe("startup refusal for mock login", () => {
  it("refuses MOCK_MODE=true with NODE_ENV=production", () => {
    expect(() => assertStartup({ MOCK_MODE: "true", NODE_ENV: "production", APP_URL: "http://localhost:3000" })).toThrow(/not allowed when NODE_ENV=production/);
  });

  it("refuses MOCK_MODE=true on a non-localhost host or on Vercel", () => {
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "development", APP_URL: "https://chattybomb.vercel.app" })).toHaveLength(1);
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "development", APP_URL: "http://10.0.0.5:3000" })).toHaveLength(1);
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "development", APP_URL: "http://localhost:3000", VERCEL: "1" })).toHaveLength(1);
    expect(() => assertStartup({ MOCK_MODE: "true", NODE_ENV: "development", APP_URL: "not a url" })).toThrow(/only allowed on localhost/);
  });

  it("allows mock mode on localhost in development", () => {
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "development", APP_URL: "http://localhost:3100" })).toEqual([]);
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "test", APP_URL: "http://127.0.0.1:3000" })).toEqual([]);
    // Unset APP_URL is not assumed to be local (Docker/VM hosts running next dev).
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "development" })).toHaveLength(1);
  });

  it("mock login itself is off when APP_URL is not local", async () => {
    vi.resetModules();
    vi.stubEnv("APP_URL", "https://app.example.com");
    try {
      const { mockAuthAllowed } = await import("./env.ts");
      expect(mockAuthAllowed()).toBe(false);
    } finally {
      vi.unstubAllEnvs(); vi.resetModules();
    }
  });
});

describe("production configuration check", () => {
  const SECRET_VALUES = { ANTHROPIC_API_KEY: "sk-ant-api03-SUPERSECRETVALUE123", VOYAGE_API_KEY: "pa-VOYAGESECRETVALUE", SUPABASE_SERVICE_ROLE_KEY: "service-SECRET-xyz", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public-key" };
  const good = {
    NODE_ENV: "production", MOCK_MODE: "false", APP_URL: "https://app.chattybomb.in",
    DATABASE_URL: "postgres://u:p@db.supabase.co:5432/postgres",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    EMBEDDING_DIM: "1024", EMBEDDING_MODEL: "voyage-3.5-lite",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", ...SECRET_VALUES,
    INNGEST_SIGNING_KEY: "signkey-prod-abcdef0123456789", INNGEST_EVENT_KEY: "event-key-0123456789",
  };

  it("passes with a complete, well-formed production config", () => {
    expect(startupProblems(good)).toEqual([]);
  });

  it("fails loudly on missing settings, listing every name", () => {
    const problems = startupProblems({ NODE_ENV: "production", MOCK_MODE: "false" });
    for (const name of ["DATABASE_URL", "ENCRYPTION_KEY", "EMBEDDING_DIM", "EMBEDDING_MODEL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY"]) {
      expect(problems).toContain(`${name} is missing`);
    }
    expect(() => assertStartup({ NODE_ENV: "production" })).toThrow(/Refusing to start/);
  });

  it("rejects malformed values without ever printing them", () => {
    const bad = { ...good,
      ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"), EMBEDDING_DIM: "1536", ANTHROPIC_API_KEY: "sk-SUPERSECRETVALUE123",
      SUPABASE_SERVICE_ROLE_KEY: good.NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL: "http://abc.supabase.co", VOYAGE_API_KEY: "has space SECRET" };
    const problems = startupProblems(bad);
    expect(problems.join("\n")).toMatch(/ENCRYPTION_KEY is malformed.*32 bytes/);
    expect(problems.some((p) => p.startsWith("EMBEDDING_DIM"))).toBe(true);
    for (const n of ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "VOYAGE_API_KEY"]) expect(problems.join("\n")).toContain(`${n} is malformed`);
    const text = (() => { try { assertStartup(bad); return ""; } catch (e) { return (e as Error).message; } })();
    for (const v of [...Object.values(SECRET_VALUES), bad.ENCRYPTION_KEY, bad.ANTHROPIC_API_KEY, "SECRET"]) expect(text).not.toContain(v);
  });

  it("flags an EMBEDDING_DIM that does not match the column in any environment", () => {
    expect(startupProblems({ NODE_ENV: "development", EMBEDDING_DIM: "512" })).toEqual(["EMBEDDING_DIM must be 1024 to match the chunks.embedding column"]);
  });
});
