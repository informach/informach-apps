import { retryAppFailedDeliveries } from "@/features/emails/service";
import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await retryAppFailedDeliveries();
  return Response.json(result);
}
