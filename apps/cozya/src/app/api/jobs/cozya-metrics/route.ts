import { getKitchenMetrics } from "@/features/kitchen/metrics";
import { rejectUnauthorizedCron } from "@/lib/cron";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  return Response.json(await getKitchenMetrics(), { headers: { "Cache-Control": "no-store" } });
}
