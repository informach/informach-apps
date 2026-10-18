import { adminWatchJob } from "@/features/alerts/jobs";
import { isAuthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vigia dos serviços (cron a cada 5 minutos). Responde só com contagens; 503
 * quando algum aviso não saiu e vai ser tentado de novo na próxima passada.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return new Response(null, { status: 401 });
  const result = await adminWatchJob();
  return Response.json(result, {
    status: result.alertsPending > 0 ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
