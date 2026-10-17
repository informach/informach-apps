import { DatabaseLockBusyError, withDatabaseLock } from "@informach/db";
import { ediProducts } from "../features/billing/catalog";
import { withCustomerBillingLifecycle } from "../features/billing/lifecycle";
import { reconcileBilling } from "../features/billing/reconciliation";
import { getPaymentReader } from "./billing";
import { getEnv } from "./env";
import { logger } from "./logger";
export async function runReconciliation() {
  const env = getEnv();
  return withDatabaseLock("edi:reconcile", () =>
    reconcileBilling({
      reader: getPaymentReader(),
      products: ediProducts(env),
      mode: env.STRIPE_MODE,
      withCustomerLock: withCustomerBillingLifecycle,
      onError: (customerId) => logger.error({ customerId }, "billing.reconciliation_failed"),
    }),
  ).catch((error) => {
    if (error instanceof DatabaseLockBusyError) return { processed: 0, attempted: 0, busy: true };
    throw error;
  });
}
