// Runs once when a server instance starts, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertStartup } = await import("./lib/startup");
  assertStartup(process.env);
}

/** Every unhandled server error (pages, route handlers, server actions) goes to monitoring. */
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/monitoring");
  await reportError(error, { path: request.path, method: request.method });
}
