import type { Database } from "@informach/db";
import {
  creditLedger,
  creditWalletMigrationEntries,
  creditWalletMigrations,
} from "@informach/db/schema";
import { and, asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { BillingError } from "../errors";
import type { CreditOwner } from "../types";
import { lockCreditOwner } from "./locks";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function convertedLegacyAmount(amount: number, multiplier: number) {
  const converted = BigInt(amount) * BigInt(multiplier);
  if (converted > 2_147_483_647n || converted < -2_147_483_647n)
    throw new BillingError("Converted credit entry exceeds the ledger limit");
  return Number(converted);
}

export async function findCreditWalletMigration(
  tx: Database | Tx,
  app: string,
  owner: CreditOwner,
) {
  if (owner.type !== "user" || !["cozya", "agenda-da-turma"].includes(app)) return undefined;
  const [migration] = await tx
    .select()
    .from(creditWalletMigrations)
    .where(
      and(
        eq(creditWalletMigrations.sourceApp, app),
        eq(creditWalletMigrations.sourceUserId, owner.id),
      ),
    );
  return migration;
}

/** Called after posting an original event, in its transaction and under its user wallet lock.
 * Lock order is always source user -> destination family -> family membership.
 * The original webhook/grant/refund validation remains authoritative; this is a posting adapter.
 */
export async function forwardMigratedCreditEntry(
  tx: Tx,
  entryId: string,
  scope: { app: string; owner: CreditOwner },
) {
  const migration = await findCreditWalletMigration(tx, scope.app, scope.owner);
  if (!migration) return;
  const [entry] = await tx
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.id, entryId),
        eq(creditLedger.app, scope.app),
        eq(creditLedger.ownerType, scope.owner.type),
        eq(creditLedger.ownerId, scope.owner.id),
      ),
    );
  if (!entry) throw new BillingError("Credit posting source is missing");
  if (entry.effectiveAt && entry.effectiveAt > new Date())
    throw new BillingError("A future legacy credit posting must wait for its effective date");
  await lockCreditOwner(tx, { type: "family", id: migration.groupId });
  const [replay] = await tx
    .select()
    .from(creditWalletMigrationEntries)
    .where(eq(creditWalletMigrationEntries.sourceEntryId, entry.id));
  if (replay) return;
  if (entry.entryType === "expiration") return; // Expiry belongs to each original lot.
  if (entry.entryType === "consumption")
    throw new BillingError("Legacy wallet is already migrated");

  const originalId = entry.sourceEntryId ?? entry.metadata.originalLedgerEntryId;
  let destinationSourceId: string | null = null;
  const funding =
    entry.entryType === "funding_suspension" || entry.entryType === "funding_restoration";
  if (funding || entry.entryType === "refund") {
    if (typeof originalId !== "string")
      throw new BillingError("Forwarded financial event has no original lot");
    const [origin] = await tx
      .select()
      .from(creditWalletMigrationEntries)
      .where(
        and(
          eq(creditWalletMigrationEntries.sourceEntryId, originalId),
          eq(creditWalletMigrationEntries.migrationId, migration.id),
        ),
      );
    if (!origin) throw new BillingError("Forwarded financial lot was not migrated");
    destinationSourceId = origin.destinationEntryId;
  } else if (entry.amount <= 0) {
    throw new BillingError("Unsupported negative legacy adjustment after migration");
  }
  // An exhausted original grant has no remaining lot to freeze. A refund still
  // posts its full validated amount: historical consumption can become debt.
  const amount =
    funding && !destinationSourceId ? 0 : convertedLegacyAmount(entry.amount, migration.multiplier);
  let destinationEntryId: string | null = null;
  if (amount !== 0) {
    const [posted] = await tx
      .insert(creditLedger)
      .values({
        ownerType: "family",
        ownerId: migration.groupId,
        app: "compasso",
        entryType: entry.entryType,
        amount,
        sourceEntryId: destinationSourceId,
        // Use SQL, not JS Date, to retain the original microsecond expiry.
        expiresAt: sql`(select expires_at from billing.credit_ledger where id = ${entry.id}::uuid)`,
        createdAt: sql`clock_timestamp()`,
        metadata: { creditMigrationId: migration.id, legacyEntryId: entry.id },
      })
      .returning({ id: creditLedger.id });
    if (!posted) throw new BillingError("Migrated financial event was not posted");
    destinationEntryId = posted.id;
  }
  await tx.insert(creditWalletMigrationEntries).values({
    sourceEntryId: entry.id,
    migrationId: migration.id,
    destinationEntryId,
    kind: "forwarded",
    sourceAmount: entry.amount,
    destinationAmount: amount,
  });
}

/** Recovers postings from older app instances or a worker interruption. No provider event
 * is reprocessed, and completed mappings make each recovery a financial no-op on replay.
 */
export async function forwardPendingLegacyCreditEntries(db: Database, app: string) {
  if (!["cozya", "agenda-da-turma"].includes(app)) return { forwarded: 0 };
  const pending = await db
    .select({ id: creditLedger.id, ownerId: creditLedger.ownerId })
    .from(creditLedger)
    .innerJoin(
      creditWalletMigrations,
      and(
        eq(creditWalletMigrations.sourceApp, creditLedger.app),
        eq(creditWalletMigrations.sourceUserId, creditLedger.ownerId),
        eq(creditLedger.ownerType, "user"),
      ),
    )
    .leftJoin(
      creditWalletMigrationEntries,
      eq(creditWalletMigrationEntries.sourceEntryId, creditLedger.id),
    )
    .where(
      and(
        eq(creditLedger.app, app),
        isNull(creditWalletMigrationEntries.sourceEntryId),
        notInArray(creditLedger.entryType, ["expiration", "consumption"]),
        sql`coalesce(${creditLedger.effectiveAt}, ${creditLedger.createdAt}) <= clock_timestamp()`,
      ),
    )
    .orderBy(asc(creditLedger.sequence))
    .limit(100);
  const failures: unknown[] = [];
  for (const entry of pending) {
    try {
      await db.transaction(async (tx) => {
        const owner = { type: "user" as const, id: entry.ownerId };
        await lockCreditOwner(tx, owner);
        await forwardMigratedCreditEntry(tx, entry.id, { app, owner });
      });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Legacy posting recovery is incomplete");
  return { forwarded: pending.length };
}
