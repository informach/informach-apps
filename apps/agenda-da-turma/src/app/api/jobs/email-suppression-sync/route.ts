import { syncAgendaSendgridSuppressions } from "@/lib/emails";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await syncAgendaSendgridSuppressions();
  return Response.json(result);
}
