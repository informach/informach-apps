import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import {
  customers,
  legacyContractAcceptances,
  legacyContractObservations,
  subscriptions,
} from "@informach/db/schema";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { refreshCompassoLegacySubscriptionFunding } from "./credits/legacy-subscriptions";
import { reconcileLegacyCancellation } from "./legacy-contract-acceptance";
import type { BillingProviderClient } from "./providers/types";

type Dependencies = {
  db: Database;
  products: readonly Product[];
  providerClient: Pick<
    BillingProviderClient,
    "readSubscriptionPaymentFacts" | "cancelSubscription"
  >;
  onError: (kind: "cancel" | "refresh", error: unknown) => void | Promise<void>;
};

/** Small parallel batches fit within the account cron deadline. Attempt timestamps
 * rotate failures without ever implying the provider facts were refreshed. */
export async function runLegacyContractMaintenance(
  deps: Dependencies,
  options: { actorId?: string } = {},
) {
  if (options.actorId !== undefined && (!options.actorId || options.actorId.length > 200))
    throw new Error("Invalid legacy maintenance actor");
  const cancellations = await deps.db.transaction(async (tx) => {
    const candidate = alias(legacyContractAcceptances, "legacy_cancel_due");
    const rows = await tx
      .select({ id: candidate.id, actorId: candidate.payerUserId })
      .from(candidate)
      .where(
        and(
          isNull(candidate.cancellationConfirmedAt),
          options.actorId ? eq(candidate.payerUserId, options.actorId) : undefined,
          or(
            isNull(candidate.cancellationAttemptedAt),
            lte(candidate.cancellationAttemptedAt, sql`clock_timestamp() - interval '30 seconds'`),
          ),
          or(
            isNull(candidate.cancellationLeaseUntil),
            lte(candidate.cancellationLeaseUntil, sql`clock_timestamp()`),
          ),
        ),
      )
      .orderBy(sql`${candidate.cancellationAttemptedAt} asc nulls first`, asc(candidate.id))
      .limit(2)
      .for("update", { of: candidate, skipLocked: true });
    if (rows.length)
      await tx
        .update(legacyContractAcceptances)
        .set({ cancellationAttemptedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            legacyContractAcceptances.id,
            rows.map((row) => row.id),
          ),
        );
    return rows;
  });
  const refreshes = await deps.db.transaction(async (tx) => {
    const observation = alias(legacyContractObservations, "legacy_refresh_due");
    const rows = await tx
      .select({
        subscriptionId: subscriptions.id,
        providerId: subscriptions.providerSubscriptionId,
        app: customers.app,
      })
      .from(observation)
      .innerJoin(subscriptions, eq(subscriptions.id, observation.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(
        legacyContractAcceptances,
        eq(legacyContractAcceptances.subscriptionId, subscriptions.id),
      )
      .where(
        and(
          isNotNull(legacyContractAcceptances.cancellationConfirmedAt),
          options.actorId ? eq(legacyContractAcceptances.payerUserId, options.actorId) : undefined,
          or(
            lte(observation.observedAt, sql`clock_timestamp() - interval '2 minutes'`),
            gt(observation.observedAt, sql`clock_timestamp()`),
          ),
          or(
            isNull(observation.refreshAttemptedAt),
            lte(observation.refreshAttemptedAt, sql`clock_timestamp() - interval '60 seconds'`),
          ),
          sql`exists (select 1 from billing.legacy_contract_acceptance_periods ap
          join billing.subscription_payment_periods p on p.id = ap.payment_period_id
          where ap.acceptance_id = ${legacyContractAcceptances.id} and p.period_end > clock_timestamp())`,
        ),
      )
      .orderBy(
        sql`${observation.refreshAttemptedAt} asc nulls first`,
        asc(observation.subscriptionId),
      )
      .limit(2)
      .for("update", { of: observation, skipLocked: true });
    if (rows.length)
      await tx
        .update(legacyContractObservations)
        .set({ refreshAttemptedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            legacyContractObservations.subscriptionId,
            rows.map((row) => row.subscriptionId),
          ),
        );
    return rows;
  });
  const tasks = [
    ...cancellations.map((row) => ({
      kind: "cancel" as const,
      run: () => reconcileLegacyCancellation(deps, row.actorId, row.id),
    })),
    ...refreshes.map((row) => ({
      kind: "refresh" as const,
      run: async () => {
        const found = await refreshCompassoLegacySubscriptionFunding(
          { ...deps, app: row.app },
          row.providerId,
        );
        if (!found) throw new Error("Legacy subscription disappeared during refresh");
      },
    })),
  ];
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  let failed = 0;
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const task = tasks[index];
    if (result?.status === "rejected" && task) {
      failed++;
      await deps.onError(task.kind, result.reason);
    }
  }
  const [missing] = await deps.db
    .select({ id: legacyContractAcceptances.id })
    .from(legacyContractAcceptances)
    .leftJoin(
      legacyContractObservations,
      eq(legacyContractObservations.subscriptionId, legacyContractAcceptances.subscriptionId),
    )
    .where(
      and(
        isNotNull(legacyContractAcceptances.cancellationConfirmedAt),
        isNull(legacyContractObservations.subscriptionId),
        options.actorId ? eq(legacyContractAcceptances.payerUserId, options.actorId) : undefined,
        sql`exists (select 1 from billing.legacy_contract_acceptance_periods ap
        join billing.subscription_payment_periods p on p.id = ap.payment_period_id
        where ap.acceptance_id = ${legacyContractAcceptances.id} and p.period_end > clock_timestamp())`,
      ),
    )
    .limit(1);
  if (missing) {
    failed++;
    await deps.onError("refresh", new Error("Legacy contract observation is missing"));
  }
  return { checked: tasks.length + (missing ? 1 : 0), failed };
}
