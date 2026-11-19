import { and, type Database, eq } from "@informach/db";
import { checkoutIntents, customers } from "@informach/db/schema";
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
