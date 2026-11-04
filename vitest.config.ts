import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: {
      MOCK_MODE: "true",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/chattybomb_test",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      WHATSAPP_APP_SECRET: "test-app-secret",
      WHATSAPP_VERIFY_TOKEN: "test-verify-token",
    },
    fileParallelism: false,
  },
});
