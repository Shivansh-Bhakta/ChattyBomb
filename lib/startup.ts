const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const hostOf = (url: string | undefined) => {
  try {
    return new URL(url ?? "http://localhost:3000").hostname;
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
  if (mock && !isLocalDeployment(e)) problems.push("MOCK_MODE=true is only allowed on localhost (APP_URL must be http://localhost or 127.0.0.1, and not on Vercel)");
  return problems;
}

/** Throws (refusing to start) when any startup problem exists. */
export function assertStartup(e: Record<string, string | undefined>) {
  const problems = startupProblems(e);
  if (problems.length) throw new Error(`Refusing to start:\n- ${problems.join("\n- ")}`);
}
