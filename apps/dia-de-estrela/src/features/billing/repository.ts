import "server-only";
import { getProSubscription } from "@informach/billing";
import {
  and,
  DatabaseLockBusyError,
  db,
  eq,
  inArray,
  ne,
  withDatabaseLock,
  withDatabaseLockWait,
} from "@informach/db";
import {
  checkoutIntents,
  customers,
  estrelaChildren,
  subscriptions,
  users,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";

export const billingDatabase = db;
/**
 * A conta Informach é compartilhada entre os apps. Antes de excluí-la por
 * aqui, nenhum outro app pode ter assinatura viva ou checkout em andamento;
 * cada app encerra o que é seu.
 */
export async function hasOtherAppSubscriptions(userId: string) {
  const pending = await db
    .select({ id: checkoutIntents.id })
    .from(checkoutIntents)
    .innerJoin(customers, eq(checkoutIntents.customerId, customers.id))
    .where(and(eq(checkoutIntents.userId, userId), ne(customers.app, "dia-de-estrela")))
    .limit(1);
  if (pending.length) return true;
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, userId),
        ne(customers.app, "dia-de-estrela"),
        inArray(subscriptions.status, [
          "active",
          "trialing",
          "past_due",
          "unpaid",
          "incomplete",
          "paused",
        ]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
export async function billingEventOwner(customerId: string) {
  const [customer] = await db
    .select({ id: customers.subjectId })
    .from(customers)
    .where(
      and(
        eq(customers.app, "dia-de-estrela"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.providerCustomerId, customerId),
      ),
    );
  return customer?.id;
}
export async function withBillingLifecycle<T>(userId: string, operation: () => Promise<T>) {
  try {
    return await withDatabaseLock(`estrela:billing:${userId}`, operation);
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
  return withDatabaseLockWait(`estrela:billing:${userId}`, operation);
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
      .select({ id: estrelaChildren.id })
      .from(estrelaChildren)
      .where(eq(estrelaChildren.userId, userId))
      .orderBy(estrelaChildren.createdAt, estrelaChildren.id);
    const selected = [...new Set(retainedProfileIds)];
    assertAllowed(
      selected.length === Math.min(limit, owned.length) &&
        selected.every((id) => owned.some((profile) => profile.id === id)),
      "CHILD_SELECTION",
      `Escolha ${Math.min(limit, owned.length)} criança(s) que continuarão ativas no plano menor.`,
    );
    await tx
      .update(estrelaChildren)
      .set({ accessEnabled: false })
      .where(eq(estrelaChildren.userId, userId));
    if (selected.length)
      await tx
        .update(estrelaChildren)
        .set({ accessEnabled: true })
        .where(and(eq(estrelaChildren.userId, userId), inArray(estrelaChildren.id, selected)));
    return selected;
  });
}
export async function entitlement(userId: string) {
  return getProSubscription(
    { db, provider: "stripe", app: "dia-de-estrela" },
    { type: "user", id: userId },
  );
}
export async function billingEmail(userId: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  assertAllowed(user, "AUTH", "Conta não encontrada.");
  return user.email;
}
