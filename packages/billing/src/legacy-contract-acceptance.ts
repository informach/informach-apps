import { createHash, randomUUID } from "node:crypto";
import {
  lockActiveWebParticipation,
  webCommercialLockKey,
} from "@informach/auth/web-participation";
import { lockRecentCentralAuthentication } from "@informach/auth/web-sessions";
import type { Product } from "@informach/config";
import { getAppCollection } from "@informach/config/collections";
import { type Database, withDatabaseLocksWait } from "@informach/db";
import {
  customers,
  familyEvents,
  familyMigrationSources,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  legacyContractObservations,
  subscriptionPaymentPeriods,
  subscriptions,
  webhookEvents,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, asc, eq, gt, isNull, like, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { refreshCompassoLegacySubscriptionFunding } from "./credits/legacy-subscriptions";
import { BillingError } from "./errors";
import {
  LEGACY_CONTRACT_POLICY_VERSION,
  LEGACY_OBSERVATION_MAX_AGE_MS,
} from "./legacy-contract-policy";
import { attachLegacyCoordination } from "./legacy-coordination";
import { type LegacyCoordinationMode, readContributorMode } from "./legacy-coordination-terms";
import type { BillingProviderClient } from "./providers/types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const POLICY = LEGACY_CONTRACT_POLICY_VERSION;
type Input = { groupId: string; subscriptionId: string };
type Confirmation = Input & { revision: string; coordination?: LegacyCoordinationMode };
type Dependencies = {
  db: Database;
  products: readonly Product[];
  providerClient: Pick<BillingProviderClient, "readSubscriptionPaymentFacts">;
};

/** Authorize before any provider I/O, then revalidate after it in the preview. */
export async function prepareLegacyContractAcceptance(
  deps: Dependencies,
  actorId: string,
  input: Input,
) {
  const source = await deps.db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, input.groupId);
    const [row] = await tx
      .select({ app: customers.app, providerSubscriptionId: subscriptions.providerSubscriptionId })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(
        familyMigrationSources,
        and(
          eq(familyMigrationSources.app, customers.app),
          eq(familyMigrationSources.sourceOwnerId, actorId),
          eq(familyMigrationSources.groupId, input.groupId),
        ),
      )
      .where(
        and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.provider, "stripe"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, actorId),
        ),
      );
    if (!row || getAppCollection(row.app) !== "compasso")
      throw new BillingError("Historical contract is not available to this payer and family");
    return row;
  });
  const refreshed = await refreshCompassoLegacySubscriptionFunding(
    { ...deps, app: source.app },
    source.providerSubscriptionId,
  );
  if (!refreshed) throw new BillingError("Historical contract is unavailable for reconciliation");
  return previewLegacyContractAcceptance(deps.db, actorId, input);
}

/** Reread provider facts before recording the exact revision shown to the payer. */
export async function confirmLegacyContractAcceptance(
  deps: Dependencies,
  actorId: string,
  input: Confirmation,
) {
  const current = await prepareLegacyContractAcceptance(deps, actorId, input);
  if (current.revision !== input.revision)
    throw new BillingError("Review the updated contract preview");
  return acceptLegacyContract(deps.db, actorId, input);
}

/** Browser-facing confirmation binds consent to the current, recent central login. */
export async function confirmRecentLegacyContractAcceptance(
  deps: Dependencies,
  actorId: string,
  sessionId: string,
  input: Confirmation,
) {
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  return withDatabaseLocksWait([webCommercialLockKey(actorId)], async () => {
    const current = await prepareLegacyContractAcceptance(deps, actorId, input);
    if (current.revision !== input.revision)
      throw new BillingError("Review the updated contract preview");
    return acceptLegacyContract(deps.db, actorId, { ...input, sessionId });
  });
}

async function inspect(tx: Tx, actorId: string, groupId: string, subscriptionId: string) {
  await lockFamilyMembership(tx, actorId, groupId);
  const contract = alias(subscriptions, "legacy_contract");
  const [record] = await tx
    .select({ sub: contract, customer: customers })
    .from(contract)
    .innerJoin(customers, eq(customers.id, contract.customerId))
    .innerJoin(
      familyMigrationSources,
      and(
        eq(familyMigrationSources.app, customers.app),
        eq(familyMigrationSources.sourceOwnerId, actorId),
        eq(familyMigrationSources.groupId, groupId),
      ),
    )
    .where(
      and(
        eq(contract.id, subscriptionId),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, actorId),
        eq(customers.provider, "stripe"),
        eq(contract.provider, "stripe"),
      ),
    )
    .for("update", { of: contract });
  if (!record || getAppCollection(record.customer.app) !== "compasso")
    throw new BillingError("Historical contract is not available to this payer and family");
  const payloadCustomer = sql<
    string | null
  >`coalesce(${webhookEvents.payload} #>> '{data,object,customer,id}', ${webhookEvents.payload} #>> '{data,object,customer}')`;
  const [pending] = await tx
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "stripe"),
        isNull(webhookEvents.processedAt),
        or(
          eq(webhookEvents.eventType, "charge.refunded"),
          like(webhookEvents.eventType, "charge.dispute.%"),
          like(webhookEvents.eventType, "customer.subscription.%"),
          like(webhookEvents.eventType, "invoice.%"),
        ),
        or(eq(webhookEvents.app, record.customer.app), isNull(webhookEvents.app)),
        or(
          eq(webhookEvents.providerCustomerId, record.customer.providerCustomerId),
          eq(payloadCustomer, record.customer.providerCustomerId),
          and(isNull(webhookEvents.providerCustomerId), sql`${payloadCustomer} is null`),
        ),
      ),
    )
    .limit(1);
  if (pending) throw new BillingError("Historical financial event requires reconciliation");
  const now = new Date();
  const periods = await tx
    .select({
      id: subscriptionPaymentPeriods.id,
      priceId: subscriptionPaymentPeriods.providerPriceId,
      start: subscriptionPaymentPeriods.periodStart,
      end: subscriptionPaymentPeriods.periodEnd,
      refunded: subscriptionPaymentPeriods.fullyRefunded,
      disputed: subscriptionPaymentPeriods.disputed,
      reconciledAt: subscriptionPaymentPeriods.reconciledAt,
    })
    .from(subscriptionPaymentPeriods)
    .where(
      and(
        eq(subscriptionPaymentPeriods.subscriptionId, subscriptionId),
        lte(subscriptionPaymentPeriods.periodStart, now),
        gt(subscriptionPaymentPeriods.periodEnd, now),
      ),
    )
    .orderBy(asc(subscriptionPaymentPeriods.id));
  const valid = periods.filter((period) => !period.refunded && !period.disputed);
  if (!valid.length) throw new BillingError("Historical paid period requires reconciliation");
  const [observation] = await tx
    .select()
    .from(legacyContractObservations)
    .where(eq(legacyContractObservations.subscriptionId, subscriptionId));
  if (
    !observation ||
    observation.observedAt.getTime() > now.getTime() ||
    now.getTime() - observation.observedAt.getTime() > LEGACY_OBSERVATION_MAX_AGE_MS ||
    valid.some((period) => observation.observedAt < period.reconciledAt)
  )
    throw new BillingError("Historical renewal requires a fresh provider observation");
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        actorId,
        groupId,
        subscriptionId,
        policy: POLICY,
        periods: periods.map(({ reconciledAt: _reconciledAt, ...period }) => period),
        status: observation.status,
        priceId: observation.providerPriceId,
        currentStart: observation.periodStart,
        currentEnd: observation.periodEnd,
        cancelAtPeriodEnd: observation.cancelAtPeriodEnd,
      }),
    )
    .digest("hex");
  return {
    revision,
    periods: valid,
    status: observation.status,
    priceId: observation.providerPriceId,
    currentEnd: observation.periodEnd,
    cancelAtPeriodEnd: observation.cancelAtPeriodEnd,
    // Shown to the adult and required again at acceptance. Deliberately kept
    // out of the revision: the receipt's revision must stay comparable while
    // the old renewal is ended, whatever the payer does meanwhile.
    coordination: (await readContributorMode(tx, groupId, actorId)).mode,
  };
}

/** Reconciles the idempotent end-of-period cancellation authorized by a receipt.
 * A lost response is recovered by reading the provider before trying again. */
export async function reconcileLegacyCancellation(
  deps: Dependencies & {
    providerClient: Pick<
      BillingProviderClient,
      "readSubscriptionPaymentFacts" | "cancelSubscription"
    >;
  },
  actorId: string,
  acceptanceId: string,
) {
  return withDatabaseLocksWait(
    [webCommercialLockKey(actorId), `compasso:legacy-cancellation:${acceptanceId}`],
    async () => {
      const token = randomUUID();
      const receipt = await deps.db.transaction(async (tx) => {
        await lockActiveWebParticipation(tx, actorId);
        const [row] = await tx
          .select()
          .from(legacyContractAcceptances)
          .where(
            and(
              eq(legacyContractAcceptances.id, acceptanceId),
              eq(legacyContractAcceptances.payerUserId, actorId),
            ),
          )
          .for("update");
        if (!row?.acceptedRevision || row.policyVersion !== POLICY)
          throw new BillingError("Legacy cancellation acceptance unavailable");
        if (row.cancellationConfirmedAt) return row;
        if (row.cancellationLeaseUntil && row.cancellationLeaseUntil > new Date())
          throw new BillingError("Legacy cancellation is already being reconciled");
        await tx
          .update(legacyContractAcceptances)
          .set({
            cancellationLeaseToken: token,
            cancellationLeaseUntil: sql`clock_timestamp() + interval '2 minutes'`,
            cancellationAttemptedAt: sql`clock_timestamp()`,
          })
          .where(eq(legacyContractAcceptances.id, row.id));
        return row;
      });
      if (receipt.cancellationConfirmedAt) return receipt;
      try {
        const input = { groupId: receipt.groupId, subscriptionId: receipt.subscriptionId };
        const accepted = await deps.db
          .select({ id: legacyContractAcceptancePeriods.paymentPeriodId })
          .from(legacyContractAcceptancePeriods)
          .where(eq(legacyContractAcceptancePeriods.acceptanceId, receipt.id))
          .orderBy(asc(legacyContractAcceptancePeriods.paymentPeriodId));
        if (!accepted.length) throw new BillingError("Legacy acceptance has no paid periods");
        const verifyPeriods = (
          preview: Awaited<ReturnType<typeof prepareLegacyContractAcceptance>>,
        ) => {
          if (
            JSON.stringify(accepted.map((item) => item.id)) !==
            JSON.stringify(preview.periods.map((period) => period.id))
          )
            throw new BillingError("Historical paid periods changed after acceptance");
          if (
            preview.periods.some(
              (period) => period.priceId !== preview.priceId || period.end > preview.currentEnd,
            )
          )
            throw new BillingError(
              "Historical contract no longer matches the accepted paid periods",
            );
        };
        const before = await prepareLegacyContractAcceptance(deps, actorId, input);
        verifyPeriods(before);
        if (before.status !== "canceled" && !before.cancelAtPeriodEnd) {
          if (before.revision !== receipt.acceptedRevision)
            throw new BillingError("Historical contract changed after acceptance");
          const [source] = await deps.db
            .select({ providerId: subscriptions.providerSubscriptionId })
            .from(subscriptions)
            .where(eq(subscriptions.id, receipt.subscriptionId));
          if (!source) throw new BillingError("Legacy subscription disappeared");
          await deps.providerClient.cancelSubscription({
            providerSubscriptionId: source.providerId,
            atPeriodEnd: true,
          });
        }
        const after = await prepareLegacyContractAcceptance(deps, actorId, input);
        verifyPeriods(after);
        if (after.status !== "canceled" && !after.cancelAtPeriodEnd)
          throw new BillingError("Provider did not confirm legacy cancellation");
        return await deps.db.transaction(async (tx) => {
          await lockActiveWebParticipation(tx, actorId);
          const [updated] = await tx
            .update(legacyContractAcceptances)
            .set({
              cancellationConfirmedAt: sql`clock_timestamp()`,
              cancellationLeaseToken: null,
              cancellationLeaseUntil: null,
            })
            .where(
              and(
                eq(legacyContractAcceptances.id, receipt.id),
                eq(legacyContractAcceptances.cancellationLeaseToken, token),
                gt(legacyContractAcceptances.cancellationLeaseUntil, sql`clock_timestamp()`),
              ),
            )
            .returning();
          if (!updated)
            throw new BillingError("Legacy cancellation lease expired before confirmation");
          return updated;
        });
      } finally {
        await deps.db
          .update(legacyContractAcceptances)
          .set({ cancellationLeaseToken: null, cancellationLeaseUntil: null })
          .where(
            and(
              eq(legacyContractAcceptances.id, receipt.id),
              eq(legacyContractAcceptances.cancellationLeaseToken, token),
            ),
          );
      }
    },
  );
}

/** Local preview only: callers must first reconcile the provider outside this transaction. */
export function previewLegacyContractAcceptance(
  db: Database,
  actorId: string,
  input: { groupId: string; subscriptionId: string },
) {
  return db.transaction((tx) => inspect(tx, actorId, input.groupId, input.subscriptionId));
}

/** Records exactly the previewed periods. It neither cancels nor creates a subscription. */
export function acceptLegacyContract(
  db: Database,
  actorId: string,
  input: {
    groupId: string;
    subscriptionId: string;
    revision: string;
    sessionId?: string;
    /** The coordination mode the adult saw in the preview. Without it only a
     * direct acceptance is admitted. */
    coordination?: LegacyCoordinationMode;
  },
) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, input.groupId);
    if (
      input.sessionId !== undefined &&
      !(await lockRecentCentralAuthentication(tx, actorId, input.sessionId))
    )
      throw new BillingError("Recent central authentication is required");
    async function existingReceipt() {
      const [existing] = await tx
        .select()
        .from(legacyContractAcceptances)
        .where(eq(legacyContractAcceptances.subscriptionId, input.subscriptionId));
      if (!existing) return null;
      if (
        existing.groupId !== input.groupId ||
        existing.payerUserId !== actorId ||
        existing.policyVersion !== POLICY
      )
        throw new BillingError("Historical contract already belongs to another acceptance");
      return existing;
    }
    const existing = await existingReceipt();
    if (existing) return existing;
    // Each adult accepts only their own contract. When the family's payer has
    // no Compasso commitment yet, the contribution is recorded directly and the
    // payer's future terms aggregate it. When the payer is already committed,
    // the contribution opens a coordination that only the payer can answer.
    // Anything still in flight on the payer's side must settle first.
    const { mode, commitment } = await readContributorMode(tx, input.groupId, actorId);
    if (mode === "wait")
      throw new BillingError("Existing Compasso billing requires coordinated migration");
    const preview = await inspect(tx, actorId, input.groupId, input.subscriptionId);
    const concurrent = await existingReceipt();
    if (concurrent) return concurrent;
    if (
      preview.revision !== input.revision ||
      (input.coordination === undefined ? mode !== "none" : input.coordination !== mode)
    )
      throw new BillingError("Review the updated contract preview");
    const [receipt] = await tx
      .insert(legacyContractAcceptances)
      .values({
        groupId: input.groupId,
        payerUserId: actorId,
        subscriptionId: input.subscriptionId,
        policyVersion: POLICY,
        acceptedRevision: input.revision,
      })
      .returning();
    if (!receipt) throw new BillingError("Historical acceptance was not recorded");
    await tx
      .insert(legacyContractAcceptancePeriods)
      .values(
        preview.periods.map((period) => ({ acceptanceId: receipt.id, paymentPeriodId: period.id })),
      );
    await tx.insert(familyEvents).values({
      groupId: input.groupId,
      actorId,
      event: "billing.legacy_contract_accepted",
      targetId: receipt.id,
    });
    if (commitment.mode === "payer_decides")
      await attachLegacyCoordination(tx, {
        accountId: commitment.account.id,
        groupId: input.groupId,
        payerUserId: commitment.account.payerUserId,
        contributorUserId: actorId,
        acceptanceId: receipt.id,
        acceptedRevision: input.revision,
        // Only what this adult saw about their own contract.
        terms: {
          subscriptionId: input.subscriptionId,
          paidThrough: preview.periods
            .map((period) => period.end)
            .reduce((latest, end) => (end > latest ? end : latest))
            .toISOString(),
          periodIds: preview.periods.map((period) => period.id),
          refund: "none",
          payerChargeDate: "depends_on_payer_approval",
        },
      });
    return receipt;
  });
}
