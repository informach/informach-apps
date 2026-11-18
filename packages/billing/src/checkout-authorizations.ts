import type { Database } from "@informach/db";
import { checkoutIntents, customers } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { BillingError } from "./errors";
import type { BillingProviderClient } from "./providers";
import type { BillingProvider } from "./types";

/** The caller holds the payer lifecycle lock. Only reads the existing attempt:
 * never creates a customer, recovers by mutation, extends expiry or drops a guard.
 * A null result is unknown, not proof of absent financial effects.
 */
export async function inspectUserCheckoutAuthorization(
  deps: {
    db: Database;
    app: string;
    provider: BillingProvider;
    providerClient: BillingProviderClient;
  },
  payerId: string,
  authorizationId: string,
) {
  const [row] = await deps.db
    .select({ intent: checkoutIntents, customer: customers })
    .from(checkoutIntents)
    .innerJoin(customers, eq(customers.id, checkoutIntents.customerId))
    .where(
      and(
        eq(customers.provider, deps.provider),
        eq(customers.app, deps.app),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, payerId),
        eq(checkoutIntents.userId, payerId),
        eq(checkoutIntents.id, authorizationId),
      ),
    );
  if (!row) return null;
  const find = deps.providerClient.findCheckoutSession;
  if (!find) throw new BillingError("Provider cannot inspect checkout authorizations");
  const state = row.intent.requestStarted
    ? await find(row.customer.providerCustomerId, authorizationId, row.intent.providerSessionId)
    : null;
  if (state && !row.intent.providerSessionId)
    await deps.db
      .update(checkoutIntents)
      .set({ providerSessionId: state.id })
      .where(
        and(
          eq(checkoutIntents.id, authorizationId),
          eq(checkoutIntents.customerId, row.customer.id),
        ),
      );
  return {
    productId: row.intent.productId,
    priceId: row.intent.request.priceId,
    successUrl: row.intent.request.successUrl,
    cancelUrl: row.intent.request.cancelUrl,
    expiresAt: row.intent.request.expiresAt,
    requestStarted: row.intent.requestStarted,
    state,
  };
}
