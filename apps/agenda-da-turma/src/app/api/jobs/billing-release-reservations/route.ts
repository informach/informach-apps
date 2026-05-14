import { billing } from "@/lib/billing";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: every 5 minutes. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const result = await billing.releaseExpiredReservations();
  return Response.json(result);
}
