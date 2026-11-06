import { runAlerts } from "@/features/lembretes/alertas";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";
import { reportError } from "@/lib/observability";

export const maxDuration = 120;

/** De 5 em 5 minutos: alertas "não marcou" aos pais e limpeza do que é operacional. */
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await recordJob("alertas", () => runAlerts()));
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json({ status: "failed", incident }, { status: 503 });
  }
}
