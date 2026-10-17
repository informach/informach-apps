import { maintainCozyaData } from "@/features/account/maintenance";
import { rejectUnauthorizedCron } from "@/lib/cron";
import { recordJob } from "@/lib/job-runs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  return Response.json(await recordJob("cozya-retention", maintainCozyaData));
}
