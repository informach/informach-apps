import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import type StripeType from "../../packages/billing/node_modules/stripe";
import { getCollectionApps } from "../../packages/config/src/collections";
import type Postgres from "../../packages/db/node_modules/postgres";

// Read-only cutover inventory. Keys are read inside the process from an explicitly
// chosen local ignored env file. Never print IDs, emails, credentials or raw API errors.
const { values } = parseArgs({
  options: {
    "stripe-env": { type: "string" },
    "stripe-key": { type: "string" },
  },
});
if (!values["stripe-env"] || !values["stripe-key"])
  throw new Error("Explicit Stripe env file/key name required");
const requireBilling = createRequire(
  new URL("../../packages/billing/package.json", import.meta.url),
);
const requireDb = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const vars = requireBilling("dotenv").parse(readFileSync(values["stripe-env"]));
const secretKey: unknown = vars[values["stripe-key"]];
if (typeof secretKey !== "string" || !/^(sk|rk)_(test|live)_/.test(secretKey))
  throw new Error("Stripe read credential unavailable");
const url = process.env.DATABASE_PUBLIC_URL;
if (!url) throw new Error("Railway public database connection unavailable");
const Stripe: typeof StripeType = requireBilling("stripe");
const readOnlyTransport: typeof fetch = async (resource, init) => {
  const target = new URL(String(resource));
  if (
    init?.method !== "GET" ||
    target.origin !== "https://api.stripe.com" ||
    !/^\/v1\/(balance|subscriptions|invoices|customers|checkout\/sessions)(\/|$)/.test(
      target.pathname,
    )
  )
    throw new Error("Stripe inventory permits only its declared GET endpoints");
  return fetch(resource, { ...init, redirect: "error" });
};
const stripe = new Stripe(secretKey, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 1,
  httpClient: Stripe.createFetchHttpClient(readOnlyTransport),
});
const postgres: typeof Postgres = requireDb("postgres");
const db = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
type Source = { app: string; customer: string; subscription: string; local_status: string };
type SourceCustomer = { app: string; customer: string };
try {
  const inventory = await db.begin("isolation level repeatable read read only", async (sql) => {
    await sql`set local statement_timeout = '10000ms'`;
    await sql`set local lock_timeout = '1000ms'`;
    const [mode] = await sql`select current_setting('transaction_read_only') as read_only`;
    if (mode?.read_only !== "on") throw new Error("Read-only database guard missing");
    const apps = getCollectionApps("compasso").map((app) => app.slug);
    const rows = await sql<Source[]>`
      select c.app, c.provider_customer_id as customer, s.provider_subscription_id as subscription, s.status::text as local_status
      from billing.subscriptions s join billing.customers c on c.id=s.customer_id
      where c.app in ${sql(apps)} and c.subject_type='user' and c.provider='stripe' and s.provider='stripe'
      order by c.app,s.id limit 21`;
    if (rows.length > 20) throw new Error("Internal inventory exceeded the reviewed pilot bound");
    const customerRows = await sql<SourceCustomer[]>`
      select distinct c.app, c.provider_customer_id as customer
      from billing.customers c
      where c.app in ${sql(apps)} and c.subject_type='user' and c.provider='stripe'
      order by c.app,c.provider_customer_id limit 21`;
    if (customerRows.length > 20)
      throw new Error("Internal customer inventory exceeded the reviewed pilot bound");
    return { sources: rows, customers: customerRows };
  });
  const live = (await stripe.balance.retrieve()).livemode;
  const aggregates = new Map<
    string,
    {
      app: string;
      localStatus: string;
      providerStatus: string;
      count: number;
      cancelAtPeriodEnd: number;
      latestPaidZero: number;
      latestPaidPositive: number;
      latestUnpaid: number;
    }
  >();
  const resourceId = (value: string | { id: string } | null) =>
    typeof value === "string" ? value : value?.id;
  const customerApps = new Map<string, string>();
  const openSessions = { subscription: 0, payment: 0, setup: 0 };
  let unavailableCustomers = 0;
  for (const source of inventory.customers) {
    const existingApp = customerApps.get(source.customer);
    if (existingApp && existingApp !== source.app)
      throw new Error("A provider customer has ambiguous app provenance");
    if (existingApp) continue;
    customerApps.set(source.customer, source.app);
    try {
      const customer = await stripe.customers.retrieve(source.customer);
      if (customer.deleted) {
        unavailableCustomers++;
        continue;
      }
      if (!("livemode" in customer) || customer.livemode !== live)
        throw new Error("Provider customer is in a different mode");
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === "resource_missing"
      ) {
        unavailableCustomers++;
        continue;
      }
      throw error;
    }
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      let batch: Awaited<ReturnType<typeof stripe.checkout.sessions.list>>;
      try {
        batch = await stripe.checkout.sessions.list({
          customer: source.customer,
          status: "open",
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        });
      } catch (error) {
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === "resource_missing"
        ) {
          unavailableCustomers++;
          break;
        }
        throw error;
      }
      for (const session of batch.data) {
        if (
          resourceId(session.customer) !== source.customer ||
          session.livemode !== live ||
          session.status !== "open"
        )
          throw new Error("Provider checkout provenance differs from inventory");
        if (
          session.mode !== "subscription" &&
          session.mode !== "payment" &&
          session.mode !== "setup"
        )
          throw new Error("Unexpected checkout mode");
        openSessions[session.mode]++;
      }
      if (!batch.has_more) break;
      cursor = batch.data.at(-1)?.id;
      if (!cursor || page === 19) throw new Error("Checkout inventory exceeded its reviewed bound");
    }
  }
  let unavailable = 0;
  for (const source of inventory.sources) {
    let subscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>;
    try {
      subscription = await stripe.subscriptions.retrieve(source.subscription, {
        expand: ["latest_invoice"],
      });
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === "resource_missing"
      ) {
        unavailable++;
        continue;
      }
      throw error;
    }
    if (resourceId(subscription.customer) !== source.customer || subscription.livemode !== live)
      throw new Error("Provider contract provenance differs from database inventory");
    const key = `${source.app}:${source.local_status}:${subscription.status}`;
    let row = aggregates.get(key);
    if (!row) {
      row = {
        app: source.app,
        localStatus: source.local_status,
        providerStatus: subscription.status,
        count: 0,
        cancelAtPeriodEnd: 0,
        latestPaidZero: 0,
        latestPaidPositive: 0,
        latestUnpaid: 0,
      };
      aggregates.set(key, row);
    }
    row.count++;
    if (subscription.cancel_at_period_end) row.cancelAtPeriodEnd++;
    const invoice = subscription.latest_invoice;
    if (invoice && typeof invoice !== "string") {
      if (resourceId(invoice.customer) !== source.customer)
        throw new Error("Invoice belongs to another customer");
      if (invoice.status === "paid") {
        if (invoice.amount_paid > 0) row.latestPaidPositive++;
        else row.latestPaidZero++;
      } else row.latestUnpaid++;
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        readOnly: true,
        recordedAt: new Date().toISOString(),
        providerMode: live ? "live" : "test",
        storedContracts: inventory.sources.length,
        unavailableInThisMode: unavailable,
        storedCustomers: inventory.customers.length,
        unavailableCustomersInThisMode: unavailableCustomers,
        openSessions,
        contracts: [...aggregates.values()],
        scope:
          "Latest invoice and open Checkout sessions only; no claim about identity, completed pending payments or full history",
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  process.exitCode = 1;
  process.stderr.write(
    `Read-only Stripe inventory failed (${error instanceof Error ? error.name : "unknown"}); no mutations were permitted.\n`,
  );
} finally {
  await db.end({ timeout: 5 });
}
