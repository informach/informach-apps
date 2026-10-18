import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { retryAgendaFailedDeliveries } from "@/lib/emails";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const result = await recordJob("email-retry", retryAgendaFailedDeliveries);
  return Response.json(result);
}
