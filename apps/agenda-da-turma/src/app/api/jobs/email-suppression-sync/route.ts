import { db } from "@informach/db";
import { syncSendgridSuppressions } from "@informach/emails/sweepers";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await syncSendgridSuppressions({ db, apiKey: env.SENDGRID_API_KEY });
  return Response.json(result);
}
