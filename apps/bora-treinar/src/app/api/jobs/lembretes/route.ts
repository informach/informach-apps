import { rodarLembretes } from "@/features/lembretes/servico";
import { authorizedJob } from "@/lib/http";
import { recordJobResponse } from "@/lib/job-runs";
import { packageLogger, reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Rotina horária: lembretes de treino e o resumo semanal de segunda. */
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  return recordJobResponse("lembretes", async () => {
    try {
      const resultado = await rodarLembretes();
      packageLogger.info("lembretes.batch_completed", resultado);
      return Response.json(
        { status: resultado.falhas ? "failed" : "ok", ...resultado },
        { status: resultado.falhas ? 503 : 200 },
      );
    } catch (error) {
      const incident = crypto.randomUUID();
      reportError(error, incident);
      return Response.json({ status: "failed", incident }, { status: 503 });
    }
  });
}
