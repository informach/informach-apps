import type { Database } from "@informach/db";
import { checkoutIntents, customers } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { BillingError, CheckoutPendingError } from "./errors";
import type { BillingProviderClient } from "./providers";
import type { ProviderCheckoutInput } from "./providers/types";

type Deps = { db: Database; providerClient: BillingProviderClient; app: string };
type Intent = typeof checkoutIntents.$inferSelect;
type Customer = Pick<
  typeof customers.$inferSelect,
  "id" | "providerCustomerId" | "subjectType" | "subjectId"
>;

/** The caller holds the subject lifecycle lock for the entire operation. */
export async function recoverCheckout(deps: Deps, customer: Customer, intent: Intent) {
  const find = deps.providerClient.findCheckoutSession;
  if (!find) throw new BillingError("Provider cannot recover checkouts");
  const known = await find(customer.providerCustomerId, intent.id, intent.providerSessionId);
  if (known) return known;
  // Fixed expiry prevents a lost/in-flight request from becoming payable after
  // the guard is released, even after the provider's idempotency retention ends.
  if (intent.request.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const session = await deps.providerClient.createCheckoutSession({
    ...intent.request,
    mode: "subscription",
    customerId: customer.providerCustomerId,
    metadata: {
      subject_type: "user",
      subject_id: intent.userId,
      product_id: intent.productId,
      checkout_intent_id: intent.id,
    },
    idempotencyKey: `checkout:${deps.app}:${intent.id}`,
  });
  await deps.db
    .update(checkoutIntents)
    .set({ providerSessionId: session.id })
    .where(eq(checkoutIntents.id, intent.id));
  const state = await find(customer.providerCustomerId, intent.id, session.id);
  if (!state) throw new CheckoutPendingError();
  return state;
}

export async function managedSubscriptionCheckout(
  deps: Deps,
  customer: Customer,
  productId: string,
  input: Pick<ProviderCheckoutInput, "priceId" | "successUrl" | "cancelUrl" | "trialDays">,
) {
  const prepare = deps.providerClient.prepareSubscriptionCheckout;
  if (!prepare || !deps.providerClient.findCheckoutSession || customer.subjectType !== "user")
    throw new BillingError("Managed checkout requires a user and a compatible provider");
  let [intent] = await deps.db
    .select()
    .from(checkoutIntents)
    .where(eq(checkoutIntents.customerId, customer.id));
  if (intent?.requestStarted) {
    const state = await recoverCheckout(deps, customer, intent);
    if (state?.status === "complete" && !state.subscriptionId) throw new CheckoutPendingError();
    const compatible =
      intent.productId === productId &&
      intent.request.priceId === input.priceId &&
      intent.request.successUrl === input.successUrl &&
      intent.request.cancelUrl === input.cancelUrl &&
      intent.request.trialDays === input.trialDays;
    if (state?.status === "open" && compatible && state.url) {
      await prepare(customer.providerCustomerId, state.id);
      return { id: state.id, url: state.url };
    }
    // Refuse completed payments and invalidate old links before replacing intent.
    await prepare(customer.providerCustomerId);
    await deps.db.delete(checkoutIntents).where(eq(checkoutIntents.id, intent.id));
    intent = undefined;
  }
  const request = { ...input, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  if (intent) {
    [intent] = await deps.db
      .update(checkoutIntents)
      .set({ productId, request })
      .where(eq(checkoutIntents.id, intent.id))
      .returning();
  } else {
    [intent] = await deps.db
      .insert(checkoutIntents)
      .values({
        customerId: customer.id,
        userId: customer.subjectId,
        productId,
        request,
      })
      .returning();
  }
  if (!intent) throw new BillingError("Could not reserve checkout");
  // The user FK exists before any external request: concurrent global account
  // deletion either wins before reservation or fails without orphaning payment.
  await prepare(customer.providerCustomerId);
  await deps.db
    .update(checkoutIntents)
    .set({ requestStarted: true })
    .where(eq(checkoutIntents.id, intent.id));
  const state = await recoverCheckout(deps, customer, intent);
  if (!state || state.status !== "open" || !state.url) throw new CheckoutPendingError();
  return { id: state.id, url: state.url };
}

/** Keep the FK through the entire payable lifecycle. A global deletion may have
 * passed its app-level preflight before this intent was inserted. Only release
 * under this customer's lifecycle lock after remotely confirmed termination. */
export async function settleCheckoutIntent(deps: Deps, providerCustomerId: string | undefined) {
  if (!providerCustomerId) return;
  const [row] = await deps.db
    .select({ intent: checkoutIntents, customer: customers })
    .from(checkoutIntents)
    .innerJoin(customers, eq(checkoutIntents.customerId, customers.id))
    .where(and(eq(customers.app, deps.app), eq(customers.providerCustomerId, providerCustomerId)))
    .limit(1);
  if (!row) return;
  const state = row.intent.requestStarted
    ? await recoverCheckout(deps, row.customer, row.intent)
    : null;
  if (state?.status === "open" || (state?.status === "complete" && !state.subscriptionId)) return;
  const prepare = deps.providerClient.prepareSubscriptionCheckout;
  if (!prepare) throw new BillingError("Provider cannot confirm checkout termination");
  try {
    await prepare(providerCustomerId);
  } catch (error) {
    // A stale terminal event must not release protection for a live subscription.
    if (error instanceof CheckoutPendingError) return;
    throw error;
  }
  await deps.db.delete(checkoutIntents).where(eq(checkoutIntents.id, row.intent.id));
}

export async function recoverPendingCheckout(deps: Deps, customer: Customer) {
  const [intent] = await deps.db
    .select()
    .from(checkoutIntents)
    .where(
      and(eq(checkoutIntents.customerId, customer.id), eq(checkoutIntents.requestStarted, true)),
    );
  if (intent) await recoverCheckout(deps, customer, intent);
}
