import { cronAuthorizationStatus } from "@/lib/cron-auth";
import { getEnv } from "@/lib/env";
import { runAccountMaintenanceJob } from "@/lib/jobs";
import { reportOperationalError } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const status = cronAuthorizationStatus(request, getEnv().CRON_SECRET);
  if (status !== 200) return new Response(null, { status });
  try {
    return Response.json(await runAccountMaintenanceJob());
  } catch (error) {
    reportOperationalError("account.maintenance.failed", error);
    return Response.json({ error: "retry_later" }, { status: 503 });
  }
}
