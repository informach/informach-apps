import { createRequire } from "node:module";
import { getCollectionApps } from "../../packages/config/src/collections.ts";
import { PRODUCTS } from "../../packages/config/src/products.ts";

// Operational inventory only: no customer identifiers, content or credentials in output.
// Railway injects DATABASE_PUBLIC_URL; never load a local .env or run the app migrator.
// This direct Railway command is outside Turborepo; biome.json scopes the Turbo env rule accordingly.
const require = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const postgres = require("postgres");
const sourceApps = getCollectionApps("compasso").map((app) => app.slug);
const url = process.env.DATABASE_PUBLIC_URL;
if (!url) throw new Error("Railway public database connection is not available");
const connection = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
try {
  const result = await connection.begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`set local statement_timeout = '10000ms'`;
      await sql`set local lock_timeout = '1000ms'`;
      const [mode] = await sql`select current_setting('transaction_read_only') as read_only,
        current_setting('server_version_num')::integer as server_version_num`;
      if (mode?.read_only !== "on") throw new Error("Read-only transaction was not established");
      if (!Number.isInteger(mode.server_version_num) || mode.server_version_num < 100000)
        throw new Error("PostgreSQL server version unavailable");
      const contracts = await sql`
      select c.app, s.provider_price_id as price_id, s.status::text as status,
        case when s.provider_subscription_id ~ '^sub_[A-Za-z0-9]+$' then 'stripe-format' else 'internal-or-other' end as provider_id_format,
        count(*)::integer as contracts,
        count(*) filter (where s.current_period_end > now())::integer as future_period_end
      from billing.subscriptions s join billing.customers c on c.id = s.customer_id
      where c.app in ${sql(sourceApps)}
      group by c.app, s.provider_price_id, s.status, provider_id_format order by c.app, s.status
    `;
      const creditHistory = await sql`
      select app, count(*)::integer as ledger_entries, count(distinct owner_id)::integer as wallets
      from billing.credit_ledger where app in ('cozya','agenda-da-turma') group by app order by app
    `;
      const [owners] = await sql`
      select count(distinct c.subject_id)::integer as personal_billing_owners,
        count(distinct c.subject_id) filter (where s.status not in ('canceled','incomplete_expired'))::integer as owners_with_nonterminal_contracts,
        count(distinct c.subject_id) filter (where s.status = 'active')::integer as owners_with_active_status
      from billing.customers c left join billing.subscriptions s on s.customer_id = c.id
      where c.app in ${sql(sourceApps)} and c.subject_type = 'user'
    `;
      const reservations = await sql`
      select app, status::text as status, count(*)::integer as reservations
      from billing.credit_reservations where app in ('cozya','agenda-da-turma') and status = 'active'
      group by app, status order by app
    `;
      return {
        readOnly: true,
        postgresMajor: Math.floor(mode.server_version_num / 10000),
        recordedAt: new Date().toISOString(),
        owners,
        contracts: contracts.map(({ price_id, ...row }) => ({
          ...row,
          catalogMode: PRODUCTS.some(
            (product) => product.app === row.app && product.stripePriceId.prod === price_id,
          )
            ? "production"
            : PRODUCTS.some(
                  (product) => product.app === row.app && product.stripePriceId.dev === price_id,
                )
              ? "test"
              : "unknown",
        })),
        creditHistory,
        reservations,
      };
    },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Financial inventory failed (${typeof error?.code === "string" ? error.code : "query unavailable"}). No changes were made.\n`,
  );
  process.exitCode = 1;
} finally {
  await connection.end({ timeout: 5 });
}
