// Runs once when a server instance starts, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertStartup } = await import("./lib/startup");
  assertStartup(process.env);
}
