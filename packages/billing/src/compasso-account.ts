import { and, type Database, desc, eq, inArray, isNull, lt, or, sql } from "@informach/db";
import {
  collectionAccounts,
  collectionPlanChanges,
  creditLedger,
  creditPurchaseIntents,
  creditWalletMigrationEntries,
  creditWalletMigrations,
  customers,
  subscriptions,
  users,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { z } from "zod/v4";
import { assertAccountPayer } from "./collection-accounts";
import { hasPendingCompassoReview } from "./collection-jobs";

/** Payer authority survives leaving a group. No family content or other adults' details is returned. */
export async function listCompassoPayerAccounts(db: Database, actorId: string, before?: string) {
  if (before) z.uuid().parse(before);
  const rows = await db
    .select({
      id: collectionAccounts.id,
      groupId: collectionAccounts.groupId,
      closedAt: collectionAccounts.closedAt,
      createdAt: collectionAccounts.createdAt,
    })
    .from(collectionAccounts)
    .innerJoin(users, eq(users.id, collectionAccounts.payerUserId))
    .where(
      and(
        eq(collectionAccounts.collection, "compasso"),
        eq(collectionAccounts.payerUserId, actorId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
        before ? lt(collectionAccounts.id, before) : undefined,
      ),
    )
    .orderBy(desc(collectionAccounts.id))
    .limit(21);
  return {
    accounts: rows.slice(0, 20),
    nextCursor: rows.length > 20 ? (rows[19]?.id ?? null) : null,
  };
}

export async function getCompassoPayerAccount(db: Database, actorId: string, accountId: string) {
  const { account } = await assertAccountPayer(db, actorId, z.uuid().parse(accountId));
  if (account.collection !== "compasso") throw new Error("Account is outside Compasso");
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.app, "compasso"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.subjectId, account.id),
      ),
    );
  const summary = {
    id: account.id,
    groupId: account.groupId,
    closedAt: account.closedAt,
    createdAt: account.createdAt,
  };
  if (!customer)
    return {
      account: summary,
      customerReady: false,
      subscriptions: [],
      purchases: [],
      planChanges: [],
    };
  const [contracts, purchases, planChanges] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        productId: subscriptions.productId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        pendingProductId: subscriptions.pendingProductId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer.id),
          // Terminal contracts' receipts remain available through the billing portal.
          inArray(subscriptions.status, [
            "incomplete",
            "trialing",
            "active",
            "past_due",
            "unpaid",
            "paused",
          ]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt)),
    db
      .select({
        id: creditPurchaseIntents.id,
        productId: creditPurchaseIntents.productId,
        credits: creditPurchaseIntents.credits,
        amountCents: creditPurchaseIntents.amountCents,
        currency: creditPurchaseIntents.currency,
        status: creditPurchaseIntents.outcome,
        refundedAmountCents: creditPurchaseIntents.refundedAmountCents,
        disputed: creditPurchaseIntents.disputed,
        createdAt: creditPurchaseIntents.createdAt,
      })
      .from(creditPurchaseIntents)
      .where(eq(creditPurchaseIntents.customerId, customer.id))
      .orderBy(desc(creditPurchaseIntents.createdAt), desc(creditPurchaseIntents.id))
      .limit(10),
    db
      .select({
        id: collectionPlanChanges.id,
        subscriptionId: collectionPlanChanges.subscriptionId,
        toProductId: collectionPlanChanges.toProductId,
        effectiveAt: collectionPlanChanges.effectiveAt,
        status: collectionPlanChanges.status,
        cancelRequestedAt: collectionPlanChanges.cancelRequestedAt,
      })
      .from(collectionPlanChanges)
      .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
      .where(
        and(
          eq(subscriptions.customerId, customer.id),
          inArray(collectionPlanChanges.status, ["preparing", "scheduled"]),
        ),
      ),
  ]);
  return {
    account: summary,
    customerReady: true,
    subscriptions: contracts,
    purchases,
    planChanges,
  };
}

/** Financial history deliberately omits person, actor, prompt, feature and provider metadata. */
export async function getCompassoWalletHistory(
  db: Database,
  actorId: string,
  groupId: string,
  before?: number,
) {
  z.uuid().parse(groupId);
  if (before !== undefined) z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(before);
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, groupId);
    const rows = await tx
      .select({
        id: creditLedger.id,
        sequence: creditLedger.sequence,
        type: creditLedger.entryType,
        amount: creditLedger.amount,
        app: creditLedger.consumerApp,
        createdAt: creditLedger.createdAt,
        expiresAt: creditLedger.expiresAt,
        legacyApp: creditWalletMigrations.sourceApp,
        migrationKind: creditWalletMigrationEntries.kind,
      })
      .from(creditLedger)
      .leftJoin(
        creditWalletMigrationEntries,
        eq(creditWalletMigrationEntries.destinationEntryId, creditLedger.id),
      )
      .leftJoin(
        creditWalletMigrations,
        eq(creditWalletMigrations.id, creditWalletMigrationEntries.migrationId),
      )
      .where(
        and(
          eq(creditLedger.ownerType, "family"),
          eq(creditLedger.ownerId, groupId),
          eq(creditLedger.app, "compasso"),
          before === undefined ? undefined : lt(creditLedger.sequence, before),
        ),
      )
      .orderBy(desc(creditLedger.sequence))
      .limit(21);
    return {
      entries: rows.slice(0, 20).map(({ sequence: _sequence, ...entry }) => entry),
      underReview: await hasPendingCompassoReview(tx, groupId),
      nextCursor: rows.length > 20 ? (rows[19]?.sequence ?? null) : null,
    };
  });
}

export async function familyHasAnotherPayer(db: Database, actorId: string, groupId: string) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, z.uuid().parse(groupId));
    const [account] = await tx
      .select({ payerId: collectionAccounts.payerUserId })
      .from(collectionAccounts)
      .where(
        and(
          eq(collectionAccounts.collection, "compasso"),
          eq(collectionAccounts.groupId, groupId),
          isNull(collectionAccounts.closedAt),
        ),
      );
    return !!account && account.payerId !== actorId;
  });
}
