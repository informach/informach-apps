import { and, type Database, desc, eq, inArray, isNotNull, lt, or, sql } from "@informach/db";
import {
  checkoutIntents,
  collectionAccounts,
  collectionPlanChanges,
  creditPurchaseIntents,
  creditReservations,
  customers,
  legacyBillingCoordinations,
  subscriptions,
  users,
} from "@informach/db/schema";
import { notInArray } from "drizzle-orm";
import {
  activePersonalWebReservations,
  eligiblePersonalBillingActor,
  personalWebBillingApps,
  personalWebCustomerCondition,
} from "./personal-scope";

const PAGE_SIZE = 100;

/** Current obligations for a closure preview, never a cancellation command.
 * Local expiry alone does not prove that a provider did not capture a payment.
 * Financial records and independent collections are preserved by this reader. */
export async function* inspectBillingDeparture(
  db: Database,
  actorId: string,
  authorize: () => Promise<void>,
) {
  async function check() {
    await authorize();
    const [actor] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, actorId), eligiblePersonalBillingActor(actorId)));
    if (!actor) throw new Error("Billing account is unavailable");
  }
  async function* pages<K extends string, T extends { id: string }>(
    kind: K,
    read: (before?: string) => Promise<T[]>,
  ) {
    let before: string | undefined;
    while (true) {
      await check();
      const records = await read(before);
      await check();
      if (!records.length) return;
      yield { kind, records };
      if (records.length < PAGE_SIZE) return;
      before = records[records.length - 1]?.id;
      if (!before) throw new Error("Invalid billing assessment cursor");
    }
  }
  yield* pages("billing.open_contracts", (before) =>
    db
      .select({
        id: subscriptions.id,
        app: customers.app,
        productId: subscriptions.productId,
        status: subscriptions.status,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        pendingProductId: subscriptions.pendingProductId,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          personalWebCustomerCondition(actorId),
          or(
            notInArray(subscriptions.status, ["canceled", "incomplete_expired"]),
            isNotNull(subscriptions.pendingProductId),
            isNotNull(subscriptions.pendingPriceId),
          ),
          before ? lt(subscriptions.id, before) : undefined,
        ),
      )
      .orderBy(desc(subscriptions.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.subscription_checkouts", (before) =>
    db
      .select({
        id: checkoutIntents.id,
        app: customers.app,
        productId: checkoutIntents.productId,
        requestStarted: checkoutIntents.requestStarted,
        createdAt: checkoutIntents.createdAt,
      })
      .from(checkoutIntents)
      .innerJoin(customers, eq(customers.id, checkoutIntents.customerId))
      .where(
        and(
          personalWebCustomerCondition(actorId),
          before ? lt(checkoutIntents.id, before) : undefined,
        ),
      )
      .orderBy(desc(checkoutIntents.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.pending_credit_purchases", (before) =>
    db
      .select({
        id: creditPurchaseIntents.id,
        app: customers.app,
        productId: creditPurchaseIntents.productId,
        amountCents: creditPurchaseIntents.amountCents,
        credits: creditPurchaseIntents.credits,
        requestStarted: creditPurchaseIntents.requestStarted,
        createdAt: creditPurchaseIntents.createdAt,
      })
      .from(creditPurchaseIntents)
      .innerJoin(customers, eq(customers.id, creditPurchaseIntents.customerId))
      .where(
        and(
          personalWebCustomerCondition(actorId),
          eq(creditPurchaseIntents.outcome, "pending"),
          before ? lt(creditPurchaseIntents.id, before) : undefined,
        ),
      )
      .orderBy(desc(creditPurchaseIntents.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.scheduled_changes", (before) =>
    db
      .select({
        id: collectionPlanChanges.id,
        app: customers.app,
        subscriptionId: subscriptions.id,
        productId: collectionPlanChanges.toProductId,
        effectiveAt: collectionPlanChanges.effectiveAt,
        status: collectionPlanChanges.status,
        cancelRequestedAt: collectionPlanChanges.cancelRequestedAt,
      })
      .from(collectionPlanChanges)
      .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          personalWebCustomerCondition(actorId),
          inArray(collectionPlanChanges.status, ["preparing", "scheduled"]),
          before ? lt(collectionPlanChanges.id, before) : undefined,
        ),
      )
      .orderBy(desc(collectionPlanChanges.id))
      .limit(PAGE_SIZE),
  );

  // Coordinations this adult answers as payer and that still bind the next
  // charge. A contributor's closure does not depend on them.
  yield* pages("billing.pending_coordinations", (before) =>
    db
      .select({
        id: legacyBillingCoordinations.id,
        state: legacyBillingCoordinations.state,
        deferUntil: legacyBillingCoordinations.deferUntil,
      })
      .from(legacyBillingCoordinations)
      .where(
        and(
          eq(legacyBillingCoordinations.payerUserId, actorId),
          inArray(legacyBillingCoordinations.state, [
            "open",
            "payer_accepted",
            "applying",
            "applied",
            "review",
          ]),
          eligiblePersonalBillingActor(actorId),
          before ? lt(legacyBillingCoordinations.id, before) : undefined,
        ),
      )
      .orderBy(desc(legacyBillingCoordinations.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.active_ai_reservations", (before) =>
    db
      .select({
        id: creditReservations.id,
        app: creditReservations.app,
        consumerApp: creditReservations.consumerApp,
        amount: creditReservations.estimatedAmount,
        expiresAt: creditReservations.expiresAt,
      })
      .from(creditReservations)
      .where(
        and(
          activePersonalWebReservations(actorId),
          eligiblePersonalBillingActor(actorId),
          before ? lt(creditReservations.id, before) : undefined,
        ),
      )
      .orderBy(desc(creditReservations.id))
      .limit(PAGE_SIZE),
  );

  // Presence only: closing Compasso never implies cancellation of Edi or a future independent collection.
  yield* pages("billing.independent_products", (before) =>
    db
      .select({ id: customers.id, app: customers.app })
      .from(customers)
      .where(
        and(
          or(
            and(eq(customers.subjectType, "user"), eq(customers.subjectId, actorId)),
            and(
              eq(customers.subjectType, "billing_account"),
              sql`exists (select 1 from ${collectionAccounts} a where a.id::text = ${customers.subjectId} and a.payer_user_id = ${actorId})`,
            ),
          ),
          notInArray(customers.app, personalWebBillingApps),
          eligiblePersonalBillingActor(actorId),
          before ? lt(customers.id, before) : undefined,
        ),
      )
      .orderBy(desc(customers.id))
      .limit(PAGE_SIZE),
  );
  await check();
}
