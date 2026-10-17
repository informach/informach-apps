import { DatabaseLockBusyError, withDatabaseLock } from "@informach/db";
import { withMonitor } from "@sentry/nextjs";
import { ediProducts } from "../features/billing/catalog";
import { withCustomerBillingLifecycle } from "../features/billing/lifecycle";
import { reconcileBilling } from "../features/billing/reconciliation";
import { getPaymentReader } from "./billing";
import { getEnv } from "./env";
import { reportOperationalError } from "./observability";
export async function runReconciliation() {
  const env = getEnv();
  return withDatabaseLock("edi:reconcile", () =>
    withMonitor(
      "edi-reconcile",
      async () => {
        let failed = false;
        const result = await reconcileBilling({
          reader: getPaymentReader(),
          products: ediProducts(env),
          mode: env.STRIPE_MODE,
          withCustomerLock: withCustomerBillingLifecycle,
          onError: (customerId, error) => {
            failed = true;
            reportOperationalError("billing.reconciliation_failed", error, { customerId });
          },
        });
        // The sweep continues and persists retries per customer, but a partial
        // failure must not generate a successful cron check-in or HTTP response.
        if (failed) throw new Error("billing.reconciliation_incomplete");
        return result;
      },
      {
        schedule: { type: "crontab", value: "*/5 * * * *" },
        checkinMargin: 2,
        maxRuntime: 2,
        timezone: "UTC",
      },
    ),
  ).catch((error) => {
    if (error instanceof DatabaseLockBusyError) return { processed: 0, attempted: 0, busy: true };
    throw error;
  });
}
