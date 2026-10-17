import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { recordJob } from "@/lib/job-runs";
import { runReconciliation } from "@/lib/jobs";
export async function POST(request: Request) {
  const env = getEnv();
  const received = Buffer.from(request.headers.get("Authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return new Response(null, { status: 401 });
  if (env.EDI_BILLING_ENABLED !== "true")
    return Response.json({ error: "billing_disabled" }, { status: 503 });
  const result = await recordJob("reconcile", runReconciliation);
  return Response.json(result);
}
