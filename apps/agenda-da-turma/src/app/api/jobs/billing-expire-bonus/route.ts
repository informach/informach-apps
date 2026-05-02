import { billing } from "@/lib/billing";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: ~daily. Expires monthly bonus credits. */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await billing.expireMonthlyBonusCredits();
  return Response.json(result);
}
