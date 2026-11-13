import "server-only";

/** Sentry envelope endpoint derived from the DSN, the same route the cron
 * monitors use. No SDK: the Conta never sends requests, users, breadcrumbs or
 * error messages, only the name of the operation that failed. */
function envelopeTarget(dsn: string | undefined) {
  if (!dsn || !URL.canParse(dsn)) return null;
  const url = new URL(dsn);
  const project = url.pathname.replace(/^\//, "");
  if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(project)) return null;
  return { dsn, endpoint: `https://${url.host}/api/${project}/envelope/` };
}

/** Never serialize provider errors: they may contain authorization codes or personal data. */
export function reportOperationalError(operation: string, _error?: unknown) {
  console.error(JSON.stringify({ app: "conta", operation, level: "error" }));
  const target = envelopeTarget(process.env.SENTRY_DSN);
  if (!target) return;
  const event = {
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    message: operation,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tags: { app: "conta", operation },
    fingerprint: ["conta", operation],
  };
  const body = [
    JSON.stringify({ event_id: event.event_id, dsn: target.dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  // Monitoring must never break or delay the operation that is reporting.
  void fetch(target.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
