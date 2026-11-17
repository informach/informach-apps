import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import type StripeType from "../../packages/billing/node_modules/stripe";
import { getCollectionApps } from "../../packages/config/src/collections";
import type Postgres from "../../packages/db/node_modules/postgres";

// Read-only audit of already persisted periods. No IDs, emails, secrets or raw
// provider errors are emitted. This does not establish completeness of history.
const { values } = parseArgs({
  options: { "stripe-env": { type: "string" }, "stripe-key": { type: "string" } },
});
if (!values["stripe-env"] || !values["stripe-key"])
  throw new Error("Explicit Stripe env file/key required");
const requireBilling = createRequire(
  new URL("../../packages/billing/package.json", import.meta.url),
);
const requireDb = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const vars = requireBilling("dotenv").parse(readFileSync(values["stripe-env"]));
const secret: unknown = vars[values["stripe-key"]];
if (typeof secret !== "string" || !/^(sk|rk)_live_/.test(secret))
  throw new Error("Live Stripe read credential unavailable");
if (!process.env.DATABASE_PUBLIC_URL)
  throw new Error("Railway public database connection unavailable");
const transport: typeof fetch = async (resource, init) => {
  const target = new URL(String(resource));
  if (
    init?.method !== "GET" ||
    target.origin !== "https://api.stripe.com" ||
    !/^\/v1\/(balance|invoices)(\/|$)/.test(target.pathname)
  )
    throw new Error("Stripe evidence audit permits only declared GET endpoints");
  return fetch(resource, { ...init, redirect: "error" });
};
const Stripe: typeof StripeType = requireBilling("stripe");
const stripe = new Stripe(secret, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 1,
  httpClient: Stripe.createFetchHttpClient(transport),
});
const postgres: typeof Postgres = requireDb("postgres");
const db = postgres(process.env.DATABASE_PUBLIC_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 5,
});
type Period = {
  app: string;
  customer_id: string;
  subscription_id: string;
  invoice_id: string;
  line_id: string;
  price_id: string;
  starts_at: Date;
  ends_at: Date;
  paid_at: Date;
};
try {
  if (!(await stripe.balance.retrieve()).livemode)
    throw new Error("Stripe live mode was not established");
  const periods = await db.begin("isolation level repeatable read read only", async (sql) => {
    await sql`set local statement_timeout = '10s'`;
    const [mode] = await sql`select current_setting('transaction_read_only') as read_only`;
    if (mode?.read_only !== "on") throw new Error("Read-only database guard missing");
    const apps = [...getCollectionApps("compasso").map((app) => app.slug), "compasso"];
    const rows = await sql<Period[]>`select c.app, c.provider_customer_id as customer_id,
      s.provider_subscription_id as subscription_id, p.provider_invoice_id as invoice_id,
      p.provider_line_id as line_id, p.provider_price_id as price_id,
      p.period_start as starts_at, p.period_end as ends_at, p.paid_at
      from billing.subscription_payment_periods p
      join billing.subscriptions s on s.id = p.subscription_id
      join billing.customers c on c.id = s.customer_id
      where c.app in ${sql(apps)} and c.provider = 'stripe' and s.provider = 'stripe' and p.provider = 'stripe'
      order by c.app, p.id limit 501`;
    if (rows.length > 500) throw new Error("Period inventory exceeds reviewed pilot bound");
    return rows;
  });
  const counts = new Map<
    string,
    { app: string; checked: number; positive: number; zero: number; mismatch: number }
  >();
  for (const period of periods) {
    const row = counts.get(period.app) ?? {
      app: period.app,
      checked: 0,
      positive: 0,
      zero: 0,
      mismatch: 0,
    };
    const invoice = await stripe.invoices.retrieve(period.invoice_id);
    const lines = await stripe.invoices.listLineItems(period.invoice_id, { limit: 100 });
    if (lines.has_more) throw new Error("Invoice line inventory exceeds reviewed bound");
    const line = lines.data.find((item) => item.id === period.line_id);
    const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    const price = line?.pricing?.price_details?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    const subId = line?.parent?.subscription_item_details?.subscription;
    const valid =
      invoice.livemode &&
      invoice.status === "paid" &&
      customer === period.customer_id &&
      subId === period.subscription_id &&
      priceId === period.price_id &&
      line &&
      line.period.start * 1000 === period.starts_at.getTime() &&
      line.period.end * 1000 === period.ends_at.getTime() &&
      invoice.status_transitions.paid_at !== null &&
      invoice.status_transitions.paid_at * 1000 === period.paid_at.getTime();
    row.checked++;
    if (!valid || !line || !Number.isSafeInteger(line.amount) || line.amount < 0) row.mismatch++;
    else if (line.amount === 0) row.zero++;
    else row.positive++;
    counts.set(period.app, row);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "live-read-only",
        checkedAt: new Date().toISOString(),
        completeHistory: false,
        apps: [...counts.values()],
      },
      null,
      2,
    )}\n`,
  );
} catch {
  process.stderr.write("Evidence inventory failed; no changes were made.\n");
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
