import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { retryAgendaFailedDeliveries } from "@/lib/emails";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const result = await retryAgendaFailedDeliveries();
  return Response.json(result);
}
