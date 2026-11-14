import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import type StripeType from "../../packages/billing/node_modules/stripe";
import { getCollectionApps } from "../../packages/config/src/collections";
import type Postgres from "../../packages/db/node_modules/postgres";
import { countUnresolvedCheckouts } from "./checkout-inventory.mjs";

// Cutover reconciliation per holder, read-only on both sides. The database is
// read in one read-only transaction and Stripe only through GET requests to the
// endpoints declared below. Output uses stable pseudonyms (holder-N, contract-N)
// and never prints emails, names, provider IDs, card data or raw API errors.
// Any item in `blocking` must be resolved by the billing reconciliation engine
// before the cutover, never by editing tables.
//
//   railway run --service Postgres --environment production -- \
//     pnpm exec tsx scripts/compasso/titular-reconciliation.mts \
//     --stripe-env apps/cozya/.env.local --stripe-key STRIPE_PROD_SECRET_KEY
const { values } = parseArgs({
  options: { "stripe-env": { type: "string" }, "stripe-key": { type: "string" } },
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
    (init?.method ?? "GET") !== "GET" ||
    target.origin !== "https://api.stripe.com" ||
    !/^\/v1\/(balance|subscriptions|invoices|charges|disputes|checkout\/sessions|subscription_schedules|payment_intents)(\/|$)/.test(
      target.pathname,
    )
  )
    throw new Error("Reconciliation permits only its declared GET endpoints");
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
const apps = getCollectionApps("compasso").map((app) => app.slug);
const pseudonym = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 8);
const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

type Contract = {
  holder: string;
  app: string;
  customer: string;
  subscription: string;
  local_status: string;
  local_period_end: Date;
  local_cancel_at_period_end: Date | null;
  periods: number | null;
  refunded_periods: number;
  disputed_periods: number;
  latest_paid_end: Date | null;
  accepted: boolean;
  cancellation_confirmed: boolean;
};
type Wallet = {
  holder: string;
  app: string;
  ledger_net_unexpired: string;
  expiring_lots: number;
  active_reservations: number;
  migrated: boolean;
};

try {
  const local = await db.begin("isolation level repeatable read read only", async (sql) => {
    await sql`set local statement_timeout = '15000ms'`;
    await sql`set local lock_timeout = '1000ms'`;
    const [mode] = await sql`select current_setting('transaction_read_only') as read_only`;
    if (mode?.read_only !== "on") throw new Error("Read-only database guard missing");
    // Production runs the pre-cutover schema; tables added by the migration
    // are read only when they already exist.
    const [present] = await sql<
      {
        periods: boolean;
        acceptances: boolean;
        eventCustomer: boolean;
        migrations: number;
      }[]
    >`select to_regclass('billing.subscription_payment_periods') is not null as periods,
        to_regclass('billing.legacy_contract_acceptances') is not null as acceptances,
        exists (select 1 from information_schema.columns where table_schema = 'billing'
          and table_name = 'webhook_events' and column_name = 'provider_customer_id') as "eventCustomer",
        (select count(*)::int from drizzle.__drizzle_migrations) as migrations`;
    const eventCustomerSql = present?.eventCustomer
      ? sql`w.provider_customer_id = c.provider_customer_id or`
      : sql``;
    const periodsSql = present?.periods
      ? sql`(select count(*)::int from billing.subscription_payment_periods p where p.subscription_id = s.id)`
      : sql`null::int`;
    const refundedSql = present?.periods
      ? sql`(select count(*)::int from billing.subscription_payment_periods p where p.subscription_id = s.id and p.fully_refunded)`
      : sql`0`;
    const disputedSql = present?.periods
      ? sql`(select count(*)::int from billing.subscription_payment_periods p where p.subscription_id = s.id and p.disputed)`
      : sql`0`;
    const latestSql = present?.periods
      ? sql`(select max(p.period_end) from billing.subscription_payment_periods p
          where p.subscription_id = s.id and not p.fully_refunded and not p.disputed)`
      : sql`null::timestamptz`;
    const acceptedSql = present?.acceptances
      ? sql`exists (select 1 from billing.legacy_contract_acceptances a where a.subscription_id = s.id)`
      : sql`false`;
    const confirmedSql = present?.acceptances
      ? sql`exists (select 1 from billing.legacy_contract_acceptances a where a.subscription_id = s.id
          and a.cancellation_confirmed_at is not null)`
      : sql`false`;
    const contracts = await sql<Contract[]>`
      select c.subject_id as holder, c.app, c.provider_customer_id as customer,
        s.provider_subscription_id as subscription, s.status::text as local_status,
        s.current_period_end as local_period_end, s.cancel_at_period_end as local_cancel_at_period_end,
        ${periodsSql} as periods, ${refundedSql} as refunded_periods,
        ${disputedSql} as disputed_periods, ${latestSql} as latest_paid_end,
        ${acceptedSql} as accepted, ${confirmedSql} as cancellation_confirmed
      from billing.subscriptions s join billing.customers c on c.id = s.customer_id
      where c.app in ${sql(apps)} and c.subject_type = 'user' and c.provider = 'stripe' and s.provider = 'stripe'
      order by c.subject_id, c.app, s.id limit 41`;
    if (contracts.length > 40) throw new Error("Internal inventory exceeded the reviewed bound");
    const pending = await sql<{ customer: string; events: number }[]>`
      select c.provider_customer_id as customer, count(w.id)::int as events
      from billing.customers c join billing.webhook_events w
        on w.provider = 'stripe' and w.processed_at is null
       and (${eventCustomerSql} w.payload #>> '{data,object,customer}' = c.provider_customer_id
         or w.payload #>> '{data,object,customer,id}' = c.provider_customer_id)
      where c.app in ${sql(apps)} and c.subject_type = 'user'
      group by c.provider_customer_id`;
    const wallets = await sql<Wallet[]>`
      select l.owner_id as holder, l.app,
        coalesce(sum(l.amount) filter (where l.expires_at is null or l.expires_at > now()), 0)::bigint::text as ledger_net_unexpired,
        count(*) filter (where l.amount > 0 and l.expires_at > now() and l.expires_at < now() + interval '30 days')::int as expiring_lots,
        (select count(*)::int from billing.credit_reservations r
          where r.owner_type = 'user' and r.owner_id = l.owner_id and r.app = l.app and r.status = 'active') as active_reservations,
        false as migrated
      from billing.credit_ledger l
      where l.owner_type = 'user' and l.app in ${sql(apps)}
      group by l.owner_id, l.app order by l.owner_id, l.app`;
    const [dia] = await sql<{ customers: number }[]>`
      select count(*)::int as customers from billing.customers where app = 'dia-de-estrela'`;
    const checkouts = await countUnresolvedCheckouts(sql, apps);
    return {
      contracts,
      pending,
      wallets,
      dia,
      checkouts,
      schema: { migrations: present?.migrations ?? 0, paymentPeriods: !!present?.periods },
    };
  });
  const live = (await stripe.balance.retrieve()).livemode;
  const holders = new Map<string, string>();
  const holder = (id: string) => {
    let label = holders.get(id);
    if (!label) {
      label = `holder-${holders.size + 1}`;
      holders.set(id, label);
    }
    return label;
  };
  const blocking: string[] = [];
  const contracts = [];
  for (const contract of local.contracts) {
    const label = `contract-${pseudonym(contract.subscription)}`;
    const remote = await stripe.subscriptions.retrieve(contract.subscription);
    const item = remote.items.data[0];
    const invoices = [];
    for await (const invoice of stripe.invoices.list({
      subscription: contract.subscription,
      limit: 100,
    }))
      invoices.push(invoice);
    const paid = invoices.filter((invoice) => invoice.status === "paid" && invoice.amount_paid > 0);
    const unresolved = invoices.filter((invoice) =>
      ["open", "draft"].includes(invoice.status ?? ""),
    );
    let refunded = 0;
    let disputed = 0;
    let processing = 0;
    for await (const charge of stripe.charges.list({ customer: contract.customer, limit: 100 })) {
      if (charge.amount_refunded > 0) refunded++;
      if (charge.disputed) disputed++;
    }
    for await (const intent of stripe.paymentIntents.list({
      customer: contract.customer,
      limit: 100,
    }))
      if (["processing", "requires_action", "requires_confirmation"].includes(intent.status))
        processing++;
    let openCheckouts = 0;
    for await (const session of stripe.checkout.sessions.list({
      customer: contract.customer,
      status: "open",
      limit: 100,
    }))
      if (session) openCheckouts++;
    let schedules = 0;
    for await (const schedule of stripe.subscriptionSchedules.list({
      customer: contract.customer,
      limit: 100,
    }))
      if (["not_started", "active"].includes(schedule.status)) schedules++;
    const pending = local.pending.find((row) => row.customer === contract.customer)?.events ?? 0;
    const remoteEnd = item?.current_period_end ?? null;
    const issues = [];
    if (remote.livemode !== live) issues.push("mode_mismatch");
    if (remote.status !== contract.local_status) issues.push("status_differs");
    if (remoteEnd && iso(remoteEnd) !== contract.local_period_end.toISOString())
      issues.push("period_end_differs");
    // Before the cutover there may be no local paid-period table; the migration
    // and the first provider refresh fill it, and the comparison runs again then.
    if (contract.periods !== null && paid.length !== contract.periods)
      issues.push("paid_invoices_differ_from_local_periods");
    if (unresolved.length) issues.push("unresolved_invoice");
    if (refunded || contract.refunded_periods) issues.push("refund_present");
    if (disputed || contract.disputed_periods) issues.push("dispute_present");
    if (processing) issues.push("payment_still_settling");
    if (openCheckouts) issues.push("open_checkout");
    if (schedules) issues.push("schedule_present");
    if (pending) issues.push("pending_webhook_events");
    for (const issue of issues) blocking.push(`${holder(contract.holder)}/${label}: ${issue}`);
    contracts.push({
      holder: holder(contract.holder),
      contract: label,
      app: contract.app,
      local: {
        status: contract.local_status,
        periodEnd: contract.local_period_end.toISOString(),
        cancelAtPeriodEnd: !!contract.local_cancel_at_period_end,
        paidPeriods: contract.periods,
        latestPaidEnd: contract.latest_paid_end?.toISOString() ?? null,
        accepted: contract.accepted,
        cancellationConfirmed: contract.cancellation_confirmed,
      },
      remote: {
        status: remote.status,
        periodEnd: iso(remoteEnd),
        cancelAtPeriodEnd: remote.cancel_at_period_end || remote.cancel_at !== null,
        paidInvoices: paid.length,
        lastPaidAmountCents: paid[0]?.amount_paid ?? null,
        unresolvedInvoices: unresolved.length,
        refundedCharges: refunded,
        disputedCharges: disputed,
        settlingPayments: processing,
        openCheckouts,
        activeSchedules: schedules,
      },
      pendingWebhookEvents: pending,
      issues,
    });
  }
  const wallets = local.wallets.map((wallet) => ({
    holder: holder(wallet.holder),
    app: wallet.app,
    ledgerNetUnexpired: Number(wallet.ledger_net_unexpired),
    expiringLotsIn30Days: wallet.expiring_lots,
    activeReservations: wallet.active_reservations,
  }));
  for (const wallet of wallets)
    if (wallet.activeReservations)
      blocking.push(`${wallet.holder}/${wallet.app}: active_ai_reservation`);
  if (local.dia?.customers) blocking.push("dia-de-estrela: billing customers exist");
  if (local.checkouts) blocking.push(`legacy checkout intents: ${local.checkouts}`);
  process.stdout.write(
    `${JSON.stringify(
      {
        readOnly: true,
        stripeMode: live ? "live" : "test",
        recordedAt: new Date().toISOString(),
        schema: local.schema,
        holders: holders.size,
        contracts,
        wallets,
        diaCustomers: local.dia?.customers ?? 0,
        legacyCheckoutIntents: local.checkouts,
        blocking,
      },
      null,
      2,
    )}\n`,
  );
  if (blocking.length) process.exitCode = 2;
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  process.stderr.write(
    `Reconciliation failed${code ? ` (${code})` : ""}. Nothing was changed on either side.\n`,
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
