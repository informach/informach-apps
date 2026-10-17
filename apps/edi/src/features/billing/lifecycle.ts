import { withDatabaseLockWait } from "@informach/db";
import { billingCustomerOwner } from "./repository";

export function withBillingLifecycle<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  return withDatabaseLockWait(`edi:billing:${userId}`, operation);
}

/** Acquire before reading Stripe, not merely before writing the resulting snapshot. */
export async function withCustomerBillingLifecycle<T>(
  customerId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const userId = await billingCustomerOwner(customerId);
  if (!userId) throw new Error("Unknown Edi billing customer");
  return withBillingLifecycle(userId, operation);
}
