import { cronAuthorizationStatus } from "@/lib/cron-auth";
import { getEnv } from "@/lib/env";
import { runBillingJob } from "@/lib/jobs";
import { reportOperationalError } from "@/lib/observability";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const env = getEnv();
  const status = cronAuthorizationStatus(request, env.CRON_SECRET);
  if (status !== 200) return new Response(null, { status });
  if (!env.STRIPE_SECRET_KEY) return new Response(null, { status: 503 });
  try {
    return Response.json(await runBillingJob());
  } catch (error) {
    reportOperationalError("billing.job.failed", error);
    return Response.json({ error: "retry_later" }, { status: 503 });
  }
}
