import { describe, expect, it, vi } from "vitest";

describe("mock auth guard", () => {
  it("is off in a production build even with MOCK_MODE=true", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { mockAuthAllowed } = await import("./env.ts");
    expect(mockAuthAllowed()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("requires Supabase settings when MOCK_MODE=false", async () => {
    vi.resetModules();
    vi.stubEnv("MOCK_MODE", "false");
    const { env } = await import("./env.ts");
    expect(() => env()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    vi.unstubAllEnvs();
  });
});
