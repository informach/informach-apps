import { billing } from "@/lib/billing";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: ~daily. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const result = await recordJob("billing-reconcile", () => billing.reconcileSubscriptions());
  return Response.json(result);
}
