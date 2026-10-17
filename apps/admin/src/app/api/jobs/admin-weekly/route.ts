import { adminWeeklyJob } from "@/features/alerts/jobs";
import { isAuthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Resumo da semana para as contas owner (cron segunda e terça, 11:00 UTC). */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return new Response(null, { status: 401 });
  const result = await adminWeeklyJob();
  return Response.json(result, {
    status: result.failed > 0 ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
