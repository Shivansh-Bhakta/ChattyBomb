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
    expect(startupProblems({ MOCK_MODE: "true", NODE_ENV: "test" })).toEqual([]); // APP_URL defaults to localhost
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
