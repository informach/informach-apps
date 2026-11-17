import "server-only";
import { finalizeReadyWebClosures } from "@informach/account/closure";
import { processBillingWebClosures } from "@informach/account/closure-billing";
import { processFamilyWebClosures } from "@informach/account/closure-family";
import { AccountDepartureBatchError } from "@informach/account/departure-jobs";
import { purgeExpiredDepartureReviews } from "@informach/account/departure-reviews";
import { runLegacyContractMaintenance } from "@informach/billing/legacy-contract-jobs";
import { runLegacyCoordinationRecovery } from "@informach/billing/legacy-coordination-jobs";
import { runLegacyFutureRecovery } from "@informach/billing/legacy-future-jobs";
import { releaseExpiredReservations } from "@informach/billing/sweepers";
import { getCollectionApps } from "@informach/config/collections";
import { db, recordJobRun } from "@informach/db";
import { getBillingMaintenance } from "./billing";
import { reportOperationalError } from "./observability";

export async function runAccountMaintenanceJob() {
  return recordJobRun({ app: "conta", job: "account-maintenance" }, async () => {
    const billing = await processBillingWebClosures({
      db,
      commerce: () => getBillingMaintenance().commerceDeps,
      future: () => getBillingMaintenance(),
    });
    const family = await processFamilyWebClosures(db);
    const finalization = await finalizeReadyWebClosures(db);
    const purged = await purgeExpiredDepartureReviews(db);
    const result = {
      completed: billing.completed + family.completed + finalization.completed,
      failed: billing.failed + family.failed + finalization.failed,
      discarded: billing.discarded + family.discarded + finalization.discarded,
      billingCompleted: billing.completed,
      familyCompleted: family.completed,
      finalized: finalization.completed,
      removed: purged.removed,
    };
    if (result.failed) throw new AccountDepartureBatchError(result);
    return result;
  });
}
export async function runBillingJob() {
  return recordJobRun({ app: "conta", job: "billing" }, async () => {
    const runtime = getBillingMaintenance();
    const [native, migrated, future] = await Promise.allSettled([
      runtime.commerce.runReconciliation(),
      runLegacyContractMaintenance({
        db,
        products: runtime.legacyProducts,
        providerClient: runtime.providerClient,
        onError: () => reportOperationalError("billing.legacy_reconciliation.failed"),
      }),
      runLegacyFutureRecovery({
        db,
        futureProvider: runtime.futureProvider,
        mode: runtime.mode,
        publicUrl: runtime.publicUrl,
        onError: () => reportOperationalError("billing.future_reconciliation.failed"),
      }),
    ]);
    // In sequence after the others: it may hold an account lock across
    // provider I/O and the coordination pool has two connections.
    const [coordination] = await Promise.allSettled([
      runLegacyCoordinationRecovery({
        ...runtime.coordinationDeps,
        onError: () => reportOperationalError("billing.coordination_reconciliation.failed"),
      }),
    ]);
    // Retiring the app billing crons must not orphan their expired reservations.
    // Old scopes are drained too; Edi and Recreio remain independent.
    const expired = await Promise.allSettled(
      ["compasso", ...getCollectionApps("compasso").map((app) => app.slug)].map((app) =>
        releaseExpiredReservations({ db, app }),
      ),
    );
    if (
      native.status === "rejected" ||
      migrated.status === "rejected" ||
      future.status === "rejected" ||
      coordination.status === "rejected" ||
      expired.some((result) => result.status === "rejected")
    )
      throw new AggregateError(
        [native, migrated, future, coordination, ...expired].flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        ),
        "CompassoBillingReconciliationIncomplete",
      );
    const result = native.value;
    const legacy = migrated.value;
    if (result.failed || legacy.failed || future.value.failed || coordination.value.failed)
      throw new Error("CompassoBillingReconciliationIncomplete");
    return {
      ...result,
      legacyChecked: legacy.checked,
      futureChecked: future.value.checked,
      coordinationChecked: coordination.value.checked,
      released: expired.reduce(
        (count, result) => count + (result.status === "fulfilled" ? result.value.released : 0),
        0,
      ),
    };
  });
}
