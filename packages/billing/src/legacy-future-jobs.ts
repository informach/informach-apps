import type { StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import { legacyFutureIntents } from "@informach/db/schema";
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import {
  cancelUnsettledLegacyFutureIntent,
  cancelUnsettledLegacyFutureSetup,
} from "./legacy-future-intent";
import { settleLegacyFutureIntent } from "./legacy-future-settlement";
import type { createStripeFutureContractProvider } from "./providers/stripe-future-contract";

/** Reconcile interrupted provider effects without recreating a subscription.
 * updatedAt records an attempt only; it is not evidence of cancellation. */
export async function runLegacyFutureRecovery(
  deps: {
    db: Database;
    mode: StripeMode;
    publicUrl: string;
    futureProvider: Pick<
      ReturnType<typeof createStripeFutureContractProvider>,
      "findSchedule" | "cancelSchedule" | "readSchedule" | "findSetupSession" | "expireSetup"
    >;
    onError: (error: unknown) => void | Promise<void>;
  },
  options: { actorId?: string } = {},
) {
  if (options.actorId !== undefined && (!options.actorId || options.actorId.length > 200))
    throw new Error("Invalid future recovery actor");
  const rows = await deps.db.transaction(async (tx) => {
    const due = await tx
      .select({ id: legacyFutureIntents.id, paymentMethodId: legacyFutureIntents.paymentMethodId })
      .from(legacyFutureIntents)
      .where(
        and(
          options.actorId ? eq(legacyFutureIntents.payerUserId, options.actorId) : undefined,
          lte(legacyFutureIntents.updatedAt, sql`clock_timestamp() - interval '3 minutes'`),
          or(
            eq(legacyFutureIntents.state, "scheduling"),
            and(
              eq(legacyFutureIntents.state, "review"),
              isNotNull(legacyFutureIntents.cancelRequestedAt),
            ),
          ),
        ),
      )
      .orderBy(asc(legacyFutureIntents.updatedAt), asc(legacyFutureIntents.id))
      .limit(2)
      .for("update", { skipLocked: true });
    if (due.length)
      await tx
        .update(legacyFutureIntents)
        .set({ updatedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            legacyFutureIntents.id,
            due.map((row) => row.id),
          ),
        );
    return due;
  });
  const dueSettlements = await deps.db.transaction(async (tx) => {
    const due = await tx
      .select({ id: legacyFutureIntents.id })
      .from(legacyFutureIntents)
      .where(
        and(
          eq(legacyFutureIntents.state, "scheduled"),
          options.actorId ? eq(legacyFutureIntents.payerUserId, options.actorId) : undefined,
          lte(legacyFutureIntents.startsAt, sql`clock_timestamp()`),
          lte(legacyFutureIntents.updatedAt, sql`clock_timestamp() - interval '3 minutes'`),
        ),
      )
      .orderBy(asc(legacyFutureIntents.updatedAt), asc(legacyFutureIntents.id))
      .limit(2)
      .for("update", { skipLocked: true });
    if (due.length)
      await tx
        .update(legacyFutureIntents)
        .set({ updatedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            legacyFutureIntents.id,
            due.map((row) => row.id),
          ),
        );
    return due;
  });
  const results = await Promise.allSettled([
    ...rows.map(async (row) => {
      const result = row.paymentMethodId
        ? await cancelUnsettledLegacyFutureIntent(deps, { intentId: row.id })
        : await cancelUnsettledLegacyFutureSetup(deps, { intentId: row.id });
      if (result.providerStatus === "not_found")
        throw new Error("Future schedule was not found and needs reconciliation");
    }),
    ...dueSettlements.map((row) => settleLegacyFutureIntent(deps, { intentId: row.id })),
  ]);
  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failed++;
      await deps.onError(result.reason);
    }
  }
  return { checked: rows.length + dueSettlements.length, failed };
}
