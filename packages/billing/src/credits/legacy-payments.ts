import { getAppCollection } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  creditLedger,
  customers,
  familyGroups,
  familyMigrationSources,
  oneTimePayments,
} from "@informach/db/schema";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { BillingError } from "../errors";
import type { BillingProviderClient, ProviderCreditPaymentSnapshot } from "../providers/types";
import { setGrantFundingState } from "./funding";
import { refundCredits } from "./grant";
import { lockLegacySourceFamily } from "./legacy-family-lock";
import { lockCreditOwner } from "./locks";
import { findCreditWalletMigration } from "./migration-forwarding";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const isMigratingCreditApp = (app: string) => app === "cozya" || app === "agenda-da-turma";
export const isLegacyBillingEvent = (type: string) =>
  type === "charge.refunded" ||
  type.startsWith("charge.dispute.") ||
  type.startsWith("customer.subscription.") ||
  type.startsWith("invoice.");

export async function resolveLegacyFinancialCustomer(
  deps: {
    db: Database;
    app: string;
    providerClient: Pick<BillingProviderClient, "readEventCustomerId">;
  },
  event: { type: string; payload: Record<string, unknown> },
) {
  if (getAppCollection(deps.app) !== "compasso" || !isLegacyBillingEvent(event.type)) return null;
  const data = event.payload.data;
  const object = data && typeof data === "object" && "object" in data ? data.object : null;
  const direct =
    object && typeof object === "object" && "customer" in object ? object.customer : null;
  const directId =
    typeof direct === "string"
      ? direct
      : direct && typeof direct === "object" && "id" in direct
        ? direct.id
        : null;
  if (typeof directId === "string" && directId.startsWith("cus_")) return directId;
  const paymentId = legacyPaymentReference(object);
  if (paymentId) {
    const [known] = await deps.db
      .select({ id: customers.providerCustomerId })
      .from(oneTimePayments)
      .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
      .where(
        and(
          eq(customers.app, deps.app),
          eq(customers.provider, "stripe"),
          eq(oneTimePayments.provider, "stripe"),
          eq(oneTimePayments.providerPaymentId, paymentId),
        ),
      );
    if (known) return known.id;
  }
  if (!deps.providerClient.readEventCustomerId)
    throw new BillingError("Financial event customer must be resolved before acceptance");
  const customerId = await deps.providerClient.readEventCustomerId(object);
  if (customerId !== null && !customerId.startsWith("cus_"))
    throw new BillingError("Financial event customer reference is invalid");
  return customerId;
}

export function legacyPaymentReference(object: unknown): string | null {
  const value =
    object && typeof object === "object" && "payment_intent" in object
      ? object.payment_intent
      : null;
  const id =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? value.id
        : null;
  return typeof id === "string" && id.startsWith("pi_") ? id : null;
}

/** Persist a financial receipt under the same locks as spending. Once accepted,
 * later reservations see the pending review; already accepted work retains its reservation.
 */
export async function withLegacyFinancialEventLock<T>(
  deps: { db: Database; app: string },
  event: { type: string; payload: Record<string, unknown> },
  persist: (writer: Database | Tx) => Promise<T>,
  providerCustomerId: string | null,
): Promise<T> {
  if (getAppCollection(deps.app) !== "compasso" || !isLegacyBillingEvent(event.type))
    return persist(deps.db);
  if (!providerCustomerId) {
    // A signed event with unknown customer can affect any legacy family in
    // this app. This exceptional path locks the finite cutover set in a stable
    // order; readers cannot pass the pending-event barrier while it is admitted.
    return deps.db.transaction(async (tx) => {
      const group = alias(familyGroups, "legacy_event_group");
      await tx
        .select({ id: group.id })
        .from(group)
        .innerJoin(familyMigrationSources, eq(familyMigrationSources.groupId, group.id))
        .where(eq(familyMigrationSources.app, deps.app))
        .orderBy(asc(group.id))
        .for("update", { of: group });
      return persist(tx);
    });
  }
  const [customer] = await deps.db
    .select({ userId: customers.subjectId })
    .from(customers)
    .where(
      and(
        eq(customers.app, deps.app),
        eq(customers.subjectType, "user"),
        eq(customers.provider, "stripe"),
        eq(customers.providerCustomerId, providerCustomerId),
      ),
    );
  if (!customer) return persist(deps.db);
  return deps.db.transaction(async (tx) => {
    if (isMigratingCreditApp(deps.app)) {
      const owner = { type: "user" as const, id: customer.userId };
      await lockCreditOwner(tx, owner);
      const migration = await findCreditWalletMigration(tx, deps.app, owner);
      if (migration) await lockCreditOwner(tx, { type: "family", id: migration.groupId });
    }
    // A legacy contract may also fund the family's access. Serialize receipt
    // admission with domain writes that hold the family row through commit.
    await lockLegacySourceFamily(tx, deps.app, customer.userId);
    return persist(tx);
  });
}

/** Same transaction and owner lock as the original purchase; no provider calls here. */
export async function settleLegacyCreditPayment(
  tx: Tx,
  app: string,
  paymentId: string,
  snapshot: ProviderCreditPaymentSnapshot,
) {
  if (!isMigratingCreditApp(app)) throw new BillingError("Payment is outside the legacy migration");
  const [record] = await tx
    .select({ payment: oneTimePayments, customer: customers })
    .from(oneTimePayments)
    .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
    .where(and(eq(oneTimePayments.id, paymentId), eq(customers.app, app)));
  if (!record) throw new BillingError("Legacy credit payment is not recorded");
  const { payment, customer } = record;
  if (
    customer.subjectType !== "user" ||
    customer.provider !== "stripe" ||
    payment.provider !== "stripe" ||
    payment.providerPaymentId !== snapshot.paymentId ||
    customer.providerCustomerId !== snapshot.customerId ||
    payment.amountCents !== snapshot.amountCents ||
    payment.currency.toUpperCase() !== snapshot.currency.toUpperCase() ||
    !Number.isSafeInteger(snapshot.amountCents) ||
    snapshot.amountCents <= 0 ||
    !Number.isSafeInteger(snapshot.amountRefundedCents) ||
    snapshot.amountRefundedCents < 0 ||
    snapshot.amountRefundedCents > snapshot.amountCents
  )
    throw new BillingError("Legacy payment facts conflict with the recorded purchase");
  const grants = await tx
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.paymentId, payment.id),
        eq(creditLedger.app, app),
        eq(creditLedger.entryType, "purchase"),
      ),
    );
  const grant = grants[0];
  if (
    grants.length !== 1 ||
    !grant ||
    grant.amount !== payment.creditAmount ||
    grant.amount <= 0 ||
    grant.ownerType !== "user" ||
    grant.ownerId !== customer.subjectId
  )
    throw new BillingError("Legacy payment has an ambiguous credit grant");
  const owner = { type: "user" as const, id: customer.subjectId };
  const [refunded] = await tx
    .select({ amount: sql<number>`coalesce(sum(-${creditLedger.amount}), 0)`.mapWith(Number) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.ownerType, "user"),
        eq(creditLedger.ownerId, owner.id),
        eq(creditLedger.app, app),
        eq(creditLedger.entryType, "refund"),
        sql`coalesce(${creditLedger.sourceEntryId}::text, ${creditLedger.metadata}->>'originalLedgerEntryId') = ${grant.id}`,
      ),
    );
  const revoked = Number(
    (BigInt(grant.amount) * BigInt(snapshot.amountRefundedCents) +
      BigInt(snapshot.amountCents) -
      1n) /
      BigInt(snapshot.amountCents),
  );
  const previous = refunded?.amount ?? 0;
  if (revoked < previous) throw new BillingError("Legacy refund observation moved backwards");
  if (revoked > previous)
    await refundCredits(
      { db: tx, app },
      {
        owner,
        originalLedgerEntryId: grant.id,
        amount: revoked - previous,
        stripeEventId: `legacy:refund:${payment.id}:${revoked}`,
        reason: "payment_refund",
        metadata: { paymentId: payment.id },
      },
    );
  // Its observation checkpoint also rejects stale/conflicting provider snapshots atomically.
  await setGrantFundingState(tx, grant, snapshot.disputed, snapshot.observedAt, {
    paymentId: payment.id,
    reason: snapshot.disputed ? "disputed" : "funding_restored",
  });
  await tx
    .update(oneTimePayments)
    .set({
      status: snapshot.amountRefundedCents === snapshot.amountCents ? "refunded" : "paid",
      updatedAt: new Date(),
    })
    .where(eq(oneTimePayments.id, payment.id));
}

type Deps = {
  db: Database;
  app: string;
  providerClient: Pick<BillingProviderClient, "readCreditPayment">;
};

/** Existing webhook/job paths call this reader; a missing earlier payment event is harmless
 * because its eventual positive posting also reconciles current provider facts atomically.
 */
export async function refreshLegacyCreditPayment(deps: Deps, providerPaymentId: string) {
  if (!isMigratingCreditApp(deps.app)) return false;
  const [record] = await deps.db
    .select({ payment: oneTimePayments, customer: customers })
    .from(oneTimePayments)
    .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
    .where(
      and(
        eq(customers.app, deps.app),
        eq(customers.provider, "stripe"),
        eq(oneTimePayments.provider, "stripe"),
        eq(oneTimePayments.providerPaymentId, providerPaymentId),
      ),
    );
  if (!record) return false;
  if (!record.payment.creditAmount || record.payment.creditAmount <= 0) return false;
  if (record.customer.subjectType !== "user" || !deps.providerClient.readCreditPayment)
    throw new BillingError("Legacy payment reconciliation requires a supported personal account");
  const snapshot = await deps.providerClient.readCreditPayment(
    record.customer.providerCustomerId,
    providerPaymentId,
  );
  await deps.db.transaction(async (tx) => {
    await lockCreditOwner(tx, { type: "user", id: record.customer.subjectId });
    await settleLegacyCreditPayment(tx, deps.app, record.payment.id, snapshot);
  });
  return true;
}

export async function refreshLegacyCreditPurchases(deps: Deps) {
  if (!isMigratingCreditApp(deps.app)) return { checked: 0 };
  const rows = await deps.db
    .select({ id: oneTimePayments.providerPaymentId })
    .from(oneTimePayments)
    .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
    .where(
      and(
        eq(customers.app, deps.app),
        eq(customers.provider, "stripe"),
        eq(oneTimePayments.provider, "stripe"),
        gt(oneTimePayments.creditAmount, 0),
        inArray(oneTimePayments.status, ["paid", "refunded"]),
      ),
    )
    .orderBy(asc(oneTimePayments.updatedAt), asc(oneTimePayments.id))
    .limit(50);
  const failures: unknown[] = [];
  for (const row of rows) {
    try {
      await refreshLegacyCreditPayment(deps, row.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Legacy purchase reconciliation is incomplete");
  return { checked: rows.length };
}
