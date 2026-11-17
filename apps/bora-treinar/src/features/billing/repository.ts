import "server-only";
import {
  and,
  DatabaseLockBusyError,
  db,
  eq,
  withDatabaseLock,
  withDatabaseLockWait,
} from "@informach/db";
import { customers, users } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";

export const billingDatabase = db;
export async function billingEventOwner(customerId: string) {
  const [customer] = await db
    .select({ id: customers.subjectId })
    .from(customers)
    .where(
      and(
        eq(customers.app, "bora-treinar"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.providerCustomerId, customerId),
      ),
    );
  return customer?.id;
}
export async function withBillingLifecycle<T>(userId: string, operation: () => Promise<T>) {
  try {
    return await withDatabaseLock(`bora:billing:${userId}`, operation);
  } catch (error) {
    assertAllowed(
      !(error instanceof DatabaseLockBusyError),
      "BUSY",
      "Há uma operação de assinatura em andamento. Aguarde e tente novamente.",
    );
    throw error;
  }
}
export function withBillingLifecycleWait<T>(userId: string, operation: () => Promise<T>) {
  return withDatabaseLockWait(`bora:billing:${userId}`, operation);
}
export async function billingEmail(userId: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  assertAllowed(user, "AUTH", "Conta não encontrada.");
  return user.email;
}
