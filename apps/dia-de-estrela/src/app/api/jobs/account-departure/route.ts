import {
  AccountDepartureBatchError,
  runAccountDepartureBatch,
} from "@informach/account/departure-jobs";
import { processEstrelaClosures } from "@/features/account/closure-service";
import { processEstrelaDepartureReviews } from "@/features/account/departure-service";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await recordJob("account-departure", () =>
      runAccountDepartureBatch({
        close: processEstrelaClosures,
        assess: processEstrelaDepartureReviews,
      }),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountDepartureBatchError)
      return Response.json(error.result, { status: 503 });
    throw error;
  }
}
