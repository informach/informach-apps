import type { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import type { Product, StripeMode } from "@informach/config";
import {
  billingCustomerOwner,
  finishReconciliation,
  markReconciliationAttempt,
  markReconciliationResult,
  pendingReconciliations,
  reconcileCustomers,
  rescheduleReconciliation,
  saveCustomerSnapshots,
} from "./repository";
export async function reconcileBilling(deps: {
  reader: Pick<ReturnType<typeof createStripePaymentFactReader>, "listSubscriptionIds" | "read">;
  products: readonly Product[];
  mode: StripeMode;
  withCustomerLock: <T>(customerId: string, operation: () => Promise<T>) => Promise<T>;
  onError: (eventId: string, error: unknown) => void;
}) {
  const accepted = new Set(deps.products.map((product) => product.stripePriceId[deps.mode]));
  accepted.delete("");
  const pending = await pendingReconciliations();
  const periodic = await reconcileCustomers();
  const ids = new Set([
    ...pending.map((job) => job.subjectId),
    ...periodic.map((customer) => customer.id),
  ]);
  let processed = 0;
  for (const customerId of ids) {
    const jobs = pending.filter((job) => job.subjectId === customerId);
    try {
      // Outbox rows survive account deletion; retire them without calling Stripe
      // or blocking live customers behind an owner that no longer exists.
      if (!(await billingCustomerOwner(customerId))) {
        for (const job of jobs) await finishReconciliation(job.id);
        continue;
      }
      await deps.withCustomerLock(customerId, async () => {
        await markReconciliationAttempt(customerId);
        const snapshots = [];
        for (const id of await deps.reader.listSubscriptionIds(customerId)) {
          const snapshot = await deps.reader.read(id, accepted);
          if (!snapshot) continue;
          const product = deps.products.find(
            (item) => item.stripePriceId[deps.mode] === snapshot.priceId,
          );
          if (!product) throw new Error("Unmapped subscription price");
          snapshots.push({ productId: product.id, snapshot });
        }
        await saveCustomerSnapshots(customerId, snapshots);
        await markReconciliationResult(customerId, true);
        for (const job of jobs) await finishReconciliation(job.id);
      });
      processed++;
    } catch (error) {
      await markReconciliationResult(customerId, false);
      for (const job of jobs) await rescheduleReconciliation(job.id, job.attempts);
      deps.onError(customerId, error);
    }
  }
  return { processed, attempted: ids.size };
}
