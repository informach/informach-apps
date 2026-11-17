import { legacyBillingCoordinations } from "@informach/db/schema";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { withCompassoBillingLock } from "./credit-purchases";
import {
  applyLegacyCoordinationLocked,
  type LegacyCoordinationDependencies,
  reviewOpenLegacyCoordinationLocked,
  settleLegacyCoordinationLocked,
} from "./legacy-coordination";

/** Resumes accepted coordinations whose provider step was interrupted, settles
 * the applied ones on proof of payment and closes open requests that no
 * longer change anything. `updatedAt` records an attempt only. A coordination
 * held in `review` is reported as a failure until someone resolves it: it is
 * a possible wrong charge, not background noise. */
export async function runLegacyCoordinationRecovery(
  deps: LegacyCoordinationDependencies & { onError: (error: unknown) => void | Promise<void> },
) {
  const due = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: legacyBillingCoordinations.id,
        accountId: legacyBillingCoordinations.accountId,
        state: legacyBillingCoordinations.state,
      })
      .from(legacyBillingCoordinations)
      .where(
        and(
          lte(legacyBillingCoordinations.updatedAt, sql`clock_timestamp() - interval '3 minutes'`),
          or(
            inArray(legacyBillingCoordinations.state, ["payer_accepted", "applying", "open"]),
            and(
              eq(legacyBillingCoordinations.state, "applied"),
              // A charge inside the deferred interval must surface before the
              // deferred date, so applied rows are revisited throughout.
              lte(
                legacyBillingCoordinations.updatedAt,
                sql`clock_timestamp() - interval '30 minutes'`,
              ),
            ),
            and(
              eq(legacyBillingCoordinations.state, "applied"),
              lte(legacyBillingCoordinations.deferUntil, sql`clock_timestamp()`),
            ),
          ),
        ),
      )
      .orderBy(asc(legacyBillingCoordinations.updatedAt), asc(legacyBillingCoordinations.id))
      .limit(2)
      .for("update", { skipLocked: true });
    if (rows.length)
      await tx
        .update(legacyBillingCoordinations)
        .set({ updatedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            legacyBillingCoordinations.id,
            rows.map((row) => row.id),
          ),
        );
    return rows;
  });
  let failed = 0;
  // In sequence: each step may hold the account lock across provider I/O and
  // the coordination pool has two connections.
  for (const row of due) {
    try {
      await withCompassoBillingLock(row.accountId, () =>
        row.state === "open"
          ? reviewOpenLegacyCoordinationLocked(deps, row.id)
          : row.state === "applied"
            ? settleLegacyCoordinationLocked(deps, row.id)
            : applyLegacyCoordinationLocked(deps, row.id),
      );
    } catch (error) {
      failed++;
      await deps.onError(error);
    }
  }
  const [held] = await deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(legacyBillingCoordinations)
    .where(eq(legacyBillingCoordinations.state, "review"));
  const review = held?.count ?? 0;
  return { checked: due.length, failed: failed + review, review };
}
