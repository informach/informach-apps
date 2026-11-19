import {
  CancelamentoDaRenovacaoIncompleto,
  executarCancelamentoDaRenovacao,
} from "@/features/cobranca/renovacao-job";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await recordJob("renovacoes", executarCancelamentoDaRenovacao), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json(
      {
        status: "failed",
        incident,
        ...(error instanceof CancelamentoDaRenovacaoIncompleto ? error.resultado : {}),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
