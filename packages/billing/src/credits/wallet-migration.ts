import { createHash } from "node:crypto";
import type { Product } from "@informach/config";
import { COMPASSO_LEGACY_CREDIT_POLICIES } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  creditLedger,
  creditReservations,
  creditWalletMigrationEntries,
  creditWalletMigrations,
  customers,
  familyEvents,
  oneTimePayments,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, inArray, sql } from "drizzle-orm";
import { BillingError } from "../errors";
import type { BillingProviderClient } from "../providers/types";
import { previewCreditConversion } from "./conversion-preview";
import { type BalanceEntry, projectCreditLots } from "./ledger-balance";
import { refreshLegacyCreditPayment } from "./legacy-payments";
import { hasPendingLegacyCreditReview } from "./legacy-review";
import { refreshLegacySubscriptionFunding } from "./legacy-subscriptions";
import { lockCreditOwner } from "./locks";
import { CreditMigrationBlockedError } from "./migration-errors";
import { convertedLegacyAmount, findCreditWalletMigration } from "./migration-forwarding";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type SourceApp = keyof typeof COMPASSO_LEGACY_CREDIT_POLICIES;
type Destination = { sourceApp: SourceApp; groupId: string };
export function isLegacyCreditSourceApp(value: unknown): value is SourceApp {
  return typeof value === "string" && Object.hasOwn(COMPASSO_LEGACY_CREDIT_POLICIES, value);
}

/** Only the authenticated owner's financial origins, never another family member's wallet. */
export async function listLegacyCreditWallets(db: Database, actorId: string) {
  const sources = await db
    .selectDistinct({ app: creditLedger.app })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.ownerType, "user"),
        eq(creditLedger.ownerId, actorId),
        inArray(creditLedger.app, Object.keys(COMPASSO_LEGACY_CREDIT_POLICIES)),
      ),
    );
  const receipts = await db
    .select({
      sourceApp: creditWalletMigrations.sourceApp,
      groupId: creditWalletMigrations.groupId,
      createdAt: creditWalletMigrations.createdAt,
    })
    .from(creditWalletMigrations)
    .where(eq(creditWalletMigrations.sourceUserId, actorId));
  return sources.flatMap(({ app }) =>
    isLegacyCreditSourceApp(app)
      ? [{ sourceApp: app, receipt: receipts.find((receipt) => receipt.sourceApp === app) ?? null }]
      : [],
  );
}

export { CreditMigrationBlockedError } from "./migration-errors";

/** Interactive preflight rechecks provider facts for this authenticated owner
 * only. All network calls happen outside financial/family transactions.
 */
export async function prepareLegacyWalletMigration(
  deps: { db: Database; products: readonly Product[]; providerClient: BillingProviderClient },
  actorId: string,
  input: Destination,
) {
  const existing = await deps.db.transaction(async (tx) => {
    await lockMigrationContext(tx, actorId, input);
    return findCreditWalletMigration(tx, input.sourceApp, { type: "user", id: actorId });
  });
  if (existing) return { status: "migrated" as const, migration: existing };
  const scope = and(
    eq(customers.app, input.sourceApp),
    eq(customers.subjectType, "user"),
    eq(customers.subjectId, actorId),
    eq(customers.provider, "stripe"),
  );
  const [payments, contracts] = await Promise.all([
    deps.db
      .selectDistinct({ id: oneTimePayments.providerPaymentId })
      .from(oneTimePayments)
      .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
      .innerJoin(creditLedger, eq(creditLedger.paymentId, oneTimePayments.id))
      .where(
        and(
          scope,
          eq(oneTimePayments.provider, "stripe"),
          eq(creditLedger.app, input.sourceApp),
          eq(creditLedger.ownerType, "user"),
          eq(creditLedger.ownerId, actorId),
          eq(creditLedger.entryType, "purchase"),
        ),
      ),
    deps.db
      .select({ id: subscriptions.providerSubscriptionId })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(and(scope, eq(subscriptions.provider, "stripe"))),
  ]);
  const financial = { ...deps, app: input.sourceApp };
  for (const payment of payments) await refreshLegacyCreditPayment(financial, payment.id);
  for (const contract of contracts) await refreshLegacySubscriptionFunding(financial, contract.id);
  return previewLegacyWalletMigration(deps.db, actorId, input);
}

async function lockMigrationContext(tx: Tx, actorId: string, input: Destination) {
  if (!Object.hasOwn(COMPASSO_LEGACY_CREDIT_POLICIES, input.sourceApp))
    throw new BillingError("This wallet is not part of the Compasso migration");
  await lockCreditOwner(tx, { type: "user", id: actorId });
  await lockCreditOwner(tx, { type: "family", id: input.groupId });
  await lockFamilyMembership(tx, actorId, input.groupId);
}

async function readPreview(tx: Tx, actorId: string, input: Destination) {
  if (await hasPendingLegacyCreditReview(tx, { sourceApp: input.sourceApp, sourceUserId: actorId }))
    throw new CreditMigrationBlockedError("review");
  const [active] = await tx
    .select({ id: creditReservations.id })
    .from(creditReservations)
    .where(
      and(
        eq(creditReservations.ownerType, "user"),
        eq(creditReservations.ownerId, actorId),
        eq(creditReservations.app, input.sourceApp),
        eq(creditReservations.status, "active"),
      ),
    )
    .limit(1);
  if (active) throw new CreditMigrationBlockedError("reservations");
  const [snapshot] = await tx.execute<{
    entries: BalanceEntry[];
    as_of: string;
    future: boolean;
  }>(sql`
    SELECT clock_timestamp()::text AS as_of,
      coalesce(bool_or(coalesce(effective_at, created_at) > clock_timestamp()), false) AS future,
      coalesce(json_agg(json_build_object(
      'id', id, 'amount', amount, 'entryType', entry_type,
      'createdAt', coalesce(effective_at, created_at), 'expiresAt', expires_at,
      'originalLedgerEntryId', coalesce(source_entry_id::text, metadata->>'originalLedgerEntryId'),
      'sequence', sequence
    ) ORDER BY sequence) FILTER (WHERE id IS NOT NULL), '[]'::json) AS entries
    FROM billing.credit_ledger WHERE owner_type = 'user' AND owner_id = ${actorId} AND app = ${input.sourceApp}
  `);
  if (!snapshot) throw new BillingError("Legacy credit snapshot unavailable");
  if (snapshot.future) throw new CreditMigrationBlockedError("future");
  const policy = COMPASSO_LEGACY_CREDIT_POLICIES[input.sourceApp];
  const preview = previewCreditConversion(snapshot.entries, snapshot.as_of, {
    policyId: policy.policyId,
    numerator: policy.multiplier,
    denominator: 1,
  });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        actorId,
        sourceApp: input.sourceApp,
        groupId: input.groupId,
        policy,
        entries: snapshot.entries,
        lots: preview.lots,
      }),
    )
    .digest("hex");
  return {
    ...preview,
    revision,
    allLots: projectCreditLots(snapshot.entries, snapshot.as_of).lots,
    allEntryIds: snapshot.entries.map((entry) => entry.id),
  };
}

/** Explicit authenticated destination. Never infer a family from its position in a query. */
export async function previewLegacyWalletMigration(
  db: Database,
  actorId: string,
  input: Destination,
) {
  return db.transaction(async (tx) => {
    await lockMigrationContext(tx, actorId, input);
    const migrated = await findCreditWalletMigration(tx, input.sourceApp, {
      type: "user",
      id: actorId,
    });
    if (migrated) return { status: "migrated" as const, migration: migrated };
    const {
      allLots: _allLots,
      allEntryIds: _allEntryIds,
      ...preview
    } = await readPreview(tx, actorId, input);
    return { status: "ready" as const, ...preview };
  });
}

export async function migrateLegacyWallet(
  db: Database,
  actorId: string,
  input: Destination & { revision: string },
) {
  return db.transaction(async (tx) => {
    await lockMigrationContext(tx, actorId, input);
    const policy = COMPASSO_LEGACY_CREDIT_POLICIES[input.sourceApp];
    const existing = await findCreditWalletMigration(tx, input.sourceApp, {
      type: "user",
      id: actorId,
    });
    if (existing) {
      if (existing.groupId !== input.groupId || existing.policyId !== policy.policyId)
        throw new BillingError("This wallet was migrated to another destination or policy");
      return existing;
    }
    const preview = await readPreview(tx, actorId, input);
    if (preview.revision !== input.revision)
      throw new BillingError("Review the updated credit migration preview");
    const [migration] = await tx
      .insert(creditWalletMigrations)
      .values({
        sourceApp: input.sourceApp,
        sourceUserId: actorId,
        groupId: input.groupId,
        policyId: policy.policyId,
        multiplier: policy.multiplier,
        createdAt: sql`clock_timestamp()`,
      })
      .returning();
    if (!migration) throw new BillingError("Credit migration was not recorded");
    for (const lot of preview.allLots) {
      // Include expired residual lots with their original expiry. They are not
      // spendable, but retain the refundable unspent portion for a delayed refund.
      const amount = convertedLegacyAmount(lot.remaining, policy.multiplier);
      let destinationEntryId: string | null = null;
      if (amount > 0) {
        const [posted] = await tx
          .insert(creditLedger)
          .values({
            ownerType: "family",
            ownerId: input.groupId,
            app: "compasso",
            entryType: "adjustment",
            amount,
            expiresAt: lot.expiresAt ? sql`${lot.expiresAt}::timestamptz` : null,
            createdAt: sql`clock_timestamp()`,
            metadata: {
              creditMigrationId: migration.id,
              legacyEntryId: lot.sourceEntryId,
              policyId: policy.policyId,
            },
          })
          .returning({ id: creditLedger.id });
        if (!posted) throw new BillingError("Opening credit lot was not recorded");
        destinationEntryId = posted.id;
      }
      await tx.insert(creditWalletMigrationEntries).values({
        migrationId: migration.id,
        sourceEntryId: lot.sourceEntryId,
        destinationEntryId,
        kind: "opening",
        sourceAmount: lot.remaining,
        destinationAmount: amount,
      });
    }
    // Mark historical non-grant events too. A recovery scan can then distinguish
    // every pre-cut fact from late postings, without relying on transaction timestamps.
    const originalLots = new Set(preview.allLots.map((lot) => lot.sourceEntryId));
    for (const sourceEntryId of preview.allEntryIds.filter(
      (entryId) => !originalLots.has(entryId),
    )) {
      await tx.insert(creditWalletMigrationEntries).values({
        migrationId: migration.id,
        sourceEntryId,
        destinationEntryId: null,
        kind: "opening",
        sourceAmount: 0,
        destinationAmount: 0,
      });
    }
    await tx.insert(familyEvents).values({
      groupId: input.groupId,
      actorId,
      event: "billing.legacy_credits_migrated",
      targetId: migration.id,
    });
    return migration;
  });
}
