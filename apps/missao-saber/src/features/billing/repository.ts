import "server-only";
import { getProSubscription } from "@informach/billing";
import {
  and,
  DatabaseLockBusyError,
  db,
  eq,
  inArray,
  withDatabaseLock,
  withDatabaseLockWait,
} from "@informach/db";
import { customers, missaoProfiles, users } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";

export const billingDatabase = db;
export async function billingEventOwner(customerId: string) {
  const [customer] = await db
    .select({ id: customers.subjectId })
    .from(customers)
    .where(
      and(
        eq(customers.app, "missao-saber"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.providerCustomerId, customerId),
      ),
    );
  return customer?.id;
}
export async function withBillingLifecycle<T>(userId: string, operation: () => Promise<T>) {
  try {
    return await withDatabaseLock(`missao:billing:${userId}`, operation);
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
  return withDatabaseLockWait(`missao:billing:${userId}`, operation);
}
export async function retainProfilesForSmallerPlan(
  userId: string,
  retainedProfileIds: string[],
  limit: number,
) {
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    assertAllowed(owner, "AUTH", "Entre novamente para continuar.");
    const owned = await tx
      .select({ id: missaoProfiles.id })
      .from(missaoProfiles)
      .where(eq(missaoProfiles.userId, userId))
      .orderBy(missaoProfiles.createdAt, missaoProfiles.id);
    const selected = [...new Set(retainedProfileIds)];
    assertAllowed(
      selected.length === Math.min(limit, owned.length) &&
        selected.every((id) => owned.some((profile) => profile.id === id)),
      "PROFILE_SELECTION",
      `Escolha ${Math.min(limit, owned.length)} perfil(is) que continuarão ativos no plano menor.`,
    );
    await tx
      .update(missaoProfiles)
      .set({ accessEnabled: false })
      .where(eq(missaoProfiles.userId, userId));
    if (selected.length)
      await tx
        .update(missaoProfiles)
        .set({ accessEnabled: true })
        .where(and(eq(missaoProfiles.userId, userId), inArray(missaoProfiles.id, selected)));
    return selected;
  });
}
export async function entitlement(userId: string) {
  return getProSubscription(
    { db, provider: "stripe", app: "missao-saber" },
    { type: "user", id: userId },
  );
}
export async function billingEmail(userId: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  assertAllowed(user, "AUTH", "Conta não encontrada.");
  return user.email;
}
