import "server-only";
import { runAccountDepartureBatch } from "@informach/account/departure-jobs";
import { processMissaoClosures } from "../features/account/closure-service";
import { processMissaoDepartureReviews } from "../features/account/departure-service";
import { cleanupStudyAccess } from "../features/study-access/repository";

/** Keeps device housekeeping when the legacy financial cron is retired. */
export async function runAccountMaintenance() {
  // Finish housekeeping before evaluating closure plans in this batch, while
  // still letting consented departures progress when housekeeping fails.
  const [cleanup] = await Promise.allSettled([cleanupStudyAccess()]);
  const departure = await runAccountDepartureBatch({
    close: processMissaoClosures,
    assess: processMissaoDepartureReviews,
  });
  if (cleanup.status === "rejected") throw cleanup.reason;
  return departure;
}
