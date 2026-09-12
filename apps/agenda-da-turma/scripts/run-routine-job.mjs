// Run every five minutes with NEXT_PUBLIC_APP_URL and CRON_SECRET in the scheduler environment.
// Never print the authorization header. Each response contains only aggregate counts and a cursor.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const secret = process.env.CRON_SECRET;
if (!appUrl || !secret) throw new Error("NEXT_PUBLIC_APP_URL and CRON_SECRET are required");
const base = new URL(appUrl);
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("The routine job requires HTTPS outside localhost");
let cursor = null;
let batches = 0;
let sent = 0;
let failed = 0;
let recipients = 0;
let hasMore = true;
do {
  const url = new URL("/api/jobs/agenda-routine", base);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(115_000),
  });
  if (!response.ok) throw new Error(`Routine job returned HTTP ${response.status}`);
  const result = await response.json();
  sent += result.sent;
  failed += result.failed;
  recipients += result.recipients;
  batches++;
  hasMore = result.hasMore;
  cursor = result.cursor;
  if (hasMore && batches >= 500)
    throw new Error("Routine job exceeded 500 batches; investigate progress");
} while (hasMore);
console.log(JSON.stringify({ batches, recipients, sent, failed }));
if (failed > 0) process.exitCode = 1;
