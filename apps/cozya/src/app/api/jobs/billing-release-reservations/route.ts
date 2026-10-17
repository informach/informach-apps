import { releaseBillingExpiredReservations } from "@/features/billing/service";
import { rejectUnauthorizedCron } from "@/lib/cron";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: every 5 minutes. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await recordJob("billing-release-reservations", releaseBillingExpiredReservations);
  return Response.json(result);
}
