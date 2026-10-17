import {
  persistPaymentPeriods,
  type SubscriptionPaymentSnapshot,
} from "@informach/billing/payment-facts";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  customers,
  ediBillingReconciliations,
  ediEntitlements,
  ediOutbox,
  ediRequestNonces,
  subscriptions,
  users,
} from "@informach/db/schema";
import { decideAccess } from "@informach/edi-licensing";

export async function enqueueBillingCustomer(
  customerId: string,
  eventId: string,
  suspend: boolean,
) {
  return db.transaction(async (tx) => {
    const customer = (
      await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.app, "edi"),
            eq(customers.provider, "stripe"),
            eq(customers.providerCustomerId, customerId),
            eq(customers.subjectType, "user"),
          ),
        )
        .limit(1)
    )[0];
    if (!customer) return false;
    const queued = await tx
      .insert(ediOutbox)
      .values({
        dedupeKey: `stripe:${eventId}:${customerId}`,
        kind: "reconcile_entitlement",
        subjectId: customerId,
      })
      .onConflictDoNothing({ target: ediOutbox.dedupeKey })
      .returning({ id: ediOutbox.id });
    // A replay of an already reconciled adverse event must not suspend a
    // recovered account without creating new work to reconcile it again.
    if (queued.length === 0) return true;
    if (suspend)
      await tx
        .insert(ediEntitlements)
        .values({ userId: customer.subjectId, suspended: true })
        .onConflictDoUpdate({
          target: ediEntitlements.userId,
          set: { suspended: true, revision: sql`${ediEntitlements.revision} + 1` },
        });
    return true;
  });
}
export async function billingCustomerOwner(customerId: string) {
  const row = (
    await db
      .select({ userId: customers.subjectId })
      .from(customers)
      .where(
        and(
          eq(customers.app, "edi"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.providerCustomerId, customerId),
        ),
      )
      .limit(1)
  )[0];
  return row?.userId ?? null;
}
export async function pendingReconciliations() {
  return db
    .select()
    .from(ediOutbox)
    .where(
      and(
        eq(ediOutbox.kind, "reconcile_entitlement"),
        isNull(ediOutbox.processedAt),
        sql`${ediOutbox.availableAt} <= now()`,
      ),
    )
    .orderBy(ediOutbox.createdAt)
    .limit(25);
}
export async function reconcileCustomers() {
  return db
    .select({ id: customers.providerCustomerId })
    .from(customers)
    .leftJoin(ediBillingReconciliations, eq(ediBillingReconciliations.customerId, customers.id))
    .where(
      and(
        eq(customers.app, "edi"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        sql`coalesce(${ediBillingReconciliations.nextAttemptAt}, ${customers.createdAt}) <= now()`,
      ),
    )
    .orderBy(
      sql`coalesce(${ediBillingReconciliations.nextAttemptAt}, ${customers.createdAt})`,
      customers.id,
    )
    .limit(25);
}
export async function markReconciliationAttempt(customerId: string) {
  const customer = await billingCustomerRecord(customerId);
  if (!customer) throw new Error("Unknown Edi customer");
  // A process interruption leaves a bounded retry reservation, not an account
  // that monopolizes every subsequent cron invocation.
  await db
    .insert(ediBillingReconciliations)
    .values({
      customerId: customer.id,
      attemptedAt: new Date(),
      nextAttemptAt: new Date(Date.now() + 600000),
    })
    .onConflictDoUpdate({
      target: ediBillingReconciliations.customerId,
      set: { attemptedAt: new Date(), nextAttemptAt: new Date(Date.now() + 600000) },
    });
}
async function billingCustomerRecord(customerId: string) {
  return (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.app, "edi"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.providerCustomerId, customerId),
        ),
      )
      .limit(1)
  )[0];
}
export async function markReconciliationResult(customerId: string, successful: boolean) {
  const customer = await billingCustomerRecord(customerId);
  // Deletion may race the lookup/lock acquisition. The cascading schedule is
  // already gone; do not abort the rest of the batch while recording a failure.
  if (!customer) return;
  await db
    .update(ediBillingReconciliations)
    .set(
      successful
        ? {
            failures: 0,
            nextAttemptAt: new Date(Date.now() + 6 * 3600000),
          }
        : {
            failures: sql`${ediBillingReconciliations.failures} + 1`,
            nextAttemptAt: sql`now() + interval '1 second' * least(21600, 30 * power(2, least(${ediBillingReconciliations.failures}, 10)))`,
          },
    )
    .where(eq(ediBillingReconciliations.customerId, customer.id));
}
export async function rescheduleReconciliation(id: string, attempts: number) {
  await db
    .update(ediOutbox)
    .set({
      attempts: attempts + 1,
      availableAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7))),
    })
    .where(eq(ediOutbox.id, id));
}
export async function finishReconciliation(id: string) {
  await db.update(ediOutbox).set({ processedAt: new Date() }).where(eq(ediOutbox.id, id));
}

export async function saveCustomerSnapshots(
  customerId: string,
  snapshots: readonly { productId: string; snapshot: SubscriptionPaymentSnapshot }[],
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const customer = (
      await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.app, "edi"),
            eq(customers.provider, "stripe"),
            eq(customers.providerCustomerId, customerId),
            eq(customers.subjectType, "user"),
          ),
        )
        .for("update")
        .limit(1)
    )[0];
    if (!customer) throw new Error("Unknown Edi customer");
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, customer.subjectId))
      .for("update");
    let paidThrough: Date | null = null;
    let suspended = false;
    let subscriptionId: string | null = null;
    for (const { productId, snapshot } of snapshots) {
      if (snapshot.customerId !== customerId)
        throw new Error("Cross-customer billing snapshot rejected");
      const saved = (
        await tx
          .insert(subscriptions)
          .values({
            customerId: customer.id,
            provider: "stripe",
            providerSubscriptionId: snapshot.subscriptionId,
            productId,
            providerPriceId: snapshot.priceId,
            status: snapshot.status,
            currentPeriodStart: snapshot.start,
            currentPeriodEnd: snapshot.end,
            trialEnd: snapshot.trialEnd,
            canceledAt: snapshot.canceledAt,
            cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd ? snapshot.end : null,
            confirmedAt:
              snapshot.status === "active" || snapshot.status === "trialing" ? now : null,
          })
          .onConflictDoUpdate({
            target: [subscriptions.provider, subscriptions.providerSubscriptionId],
            set: {
              status: snapshot.status,
              productId,
              providerPriceId: snapshot.priceId,
              currentPeriodStart: snapshot.start,
              currentPeriodEnd: snapshot.end,
              trialEnd: snapshot.trialEnd,
              canceledAt: snapshot.canceledAt,
              cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd ? snapshot.end : null,
              updatedAt: now,
            },
          })
          .returning({ id: subscriptions.id })
      )[0];
      if (!saved) throw new Error("Missing saved subscription");
      await persistPaymentPeriods(tx, saved.id, snapshot);
      const access = decideAccess(
        {
          status: snapshot.status,
          trialEnd: snapshot.trialEnd,
          suspended: false,
          periods: snapshot.periods.map((fact) => ({
            start: fact.start,
            end: fact.end,
            refunded: fact.fullyRefunded,
            disputed: fact.disputed,
          })),
        },
        now,
      );
      if (!access.allowed && access.reason === "suspended") suspended = true;
      if (access.allowed && (!paidThrough || paidThrough < access.paidThrough)) {
        paidThrough = access.paidThrough;
        subscriptionId = saved.id;
      }
    }
    await tx
      .insert(ediEntitlements)
      .values({
        userId: customer.subjectId,
        subscriptionId,
        paidThrough,
        suspended,
        reconciledAt: now,
      })
      .onConflictDoUpdate({
        target: ediEntitlements.userId,
        set: {
          subscriptionId,
          paidThrough,
          suspended,
          reconciledAt: now,
          revision: sql`${ediEntitlements.revision} + 1`,
        },
      });
    await tx.update(customers).set({ updatedAt: now }).where(eq(customers.id, customer.id));
    await tx.execute(
      sql`delete from ${ediRequestNonces} where ${ediRequestNonces.nonce} in (select ${ediRequestNonces.nonce} from ${ediRequestNonces} where ${ediRequestNonces.expiresAt} < now() limit 1000)`,
    );
  });
}
