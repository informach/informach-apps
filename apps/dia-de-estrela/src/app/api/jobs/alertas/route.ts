import { runAlerts } from "@/features/lembretes/alertas";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";
import { reportError } from "@/lib/observability";
import { redis } from "@/lib/redis";

export const maxDuration = 120;

// Onde a execução anterior parou, para a próxima continuar dali (ver runAlerts).
const cursorKey = "dia-de-estrela:jobs:alertas:cursor";

/** De 5 em 5 minutos: alertas "não marcou" aos pais e limpeza do que é operacional. */
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await recordJob("alertas", async () => {
      const startAfter = (await redis?.get(cursorKey)) ?? null;
      const { nextCursor, ...rest } = await runAlerts(Date.now(), startAfter);
      if (nextCursor) await redis?.set(cursorKey, nextCursor, "EX", 86_400);
      else await redis?.del(cursorKey);
      return rest;
    });
    return Response.json(result);
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json({ status: "failed", incident }, { status: 503 });
  }
}
