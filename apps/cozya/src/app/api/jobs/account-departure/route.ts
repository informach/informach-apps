import {
  AccountDepartureBatchError,
  runAccountDepartureBatch,
} from "@informach/account/departure-jobs";
import { processCozyaClosures } from "@/features/account/closure-service";
import { processCozyaDepartureReviews } from "@/features/account/departure-service";
import { rejectUnauthorizedCron } from "@/lib/cron";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await recordJob("account-departure", () =>
      runAccountDepartureBatch({
        close: processCozyaClosures,
        assess: processCozyaDepartureReviews,
      }),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountDepartureBatchError)
      return Response.json(error.result, { status: 503 });
    throw error;
  }
}
