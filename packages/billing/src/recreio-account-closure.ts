import { and, type Database, eq } from "@informach/db";
import { checkoutIntents, customers, subscriptions } from "@informach/db/schema";
import { z } from "zod";
import { BillingError } from "./errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Somente a origem comercial do próprio pagante no Recreio. O chamador mantém
 * ciclo financeiro e identidade nativa; não há rede, cancelamento ou conclusão.
 * Não retornar email, payload de Checkout, URLs ou metadados livres. */
export async function readRecreioAccountClosureSource(tx: Tx, payerId: string) {
  if (!payerId || payerId.length > 256) throw new BillingError("Invalid Recreio closure owner");
  const owned = await tx
    .select({ id: customers.id, providerCustomerId: customers.providerCustomerId })
    .from(customers)
    .where(
      and(
        eq(customers.app, "recreio"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, payerId),
      ),
    )
    .orderBy(customers.id)
    .limit(2)
    .for("share");
  if (owned.length > 1) throw new BillingError("Recreio closure customer requires review");
  const customer = owned[0];
  if (!customer) return { customer: null, checkout: null };
  const [checkout] = await tx
    .select({
      id: checkoutIntents.id,
      owner: checkoutIntents.userId,
      requestStarted: checkoutIntents.requestStarted,
    })
    .from(checkoutIntents)
    .where(eq(checkoutIntents.customerId, customer.id))
    .for("share");
  if (checkout && checkout.owner !== payerId)
    throw new BillingError("Recreio closure checkout requires review");
  return {
    customer,
    checkout: checkout ? { id: checkout.id, requestStarted: checkout.requestStarted } : null,
  };
}

/** Identidade e período locais para o cancelamento, sem avaliação de acesso
 * ou declaração de que o provedor está conciliado. Apenas o pagante próprio;
 * o domínio nativo ainda precisa comprovar seu contrato antes de aceitar. */
export async function readRecreioOwnedSubscription(
  tx: Tx,
  payerId: string,
  subscriptionId: string,
) {
  if (!payerId || payerId.length > 256 || !z.uuid().safeParse(subscriptionId).success)
    throw new BillingError("Invalid Recreio subscription reference");
  const [row] = await tx
    .select({
      id: subscriptions.id,
      customerId: customers.id,
      providerCustomerId: customers.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      productId: subscriptions.productId,
      priceId: subscriptions.providerPriceId,
      periodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.provider, "stripe"),
        eq(customers.app, "recreio"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, payerId),
      ),
    )
    .for("share");
  return row ?? null;
}

/** Complete bounded local identity inventory for the technical closure worker.
 * Caller holds its lifecycle; rows are not proof of a provider-side absence. */
export async function readRecreioOwnedSubscriptions(tx: Tx, payerId: string) {
  if (!payerId || payerId.length > 256) throw new BillingError("Invalid Recreio inventory owner");
  const rows = await tx
    .select({
      id: subscriptions.id,
      customerId: customers.id,
      providerCustomerId: customers.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      productId: subscriptions.productId,
      priceId: subscriptions.providerPriceId,
      periodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(subscriptions.provider, "stripe"),
        eq(customers.app, "recreio"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, payerId),
      ),
    )
    .orderBy(subscriptions.id)
    .limit(601)
    .for("share");
  if (rows.length > 600)
    throw new BillingError("Recreio inventory exceeds its complete-read limit");
  return rows;
}
