import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every asService() call bypasses RLS, so each must declare why it is safe.
const SCOPES = ["tenant", "webhook-lookup", "platform-job", "mock-auth", "onboarding"];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });

describe("service-role access", () => {
  it("every asService() call is annotated with a known scope, and tenant-scoped ones mention tenant_id/tenantId", () => {
    const unchecked: string[] = [];
    for (const file of ["app", "lib", "scripts", "inngest"].flatMap(files)) {
      if (file === join("lib", "db.ts")) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("asService(")) return;
        const scope = line.match(/\/\/ scope: ([a-z-]+)/)?.[1];
        const window = lines.slice(i, i + 12).join("\n");
        if (!scope || !SCOPES.includes(scope) || (scope === "tenant" && !/tenant_id|tenantId|tenant/.test(window))) unchecked.push(`${file}:${i + 1}`);
      });
    }
    expect(unchecked).toEqual([]);
  });
});
