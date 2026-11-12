import { executarManutencao } from "@/features/manutencao/service";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Manutenção do Recreio, chamada pelo agendador: fecha posses vencidas, marca
 * instâncias sumidas, apaga ingressos antigos e encerra sessões de jogo
 * vencidas. Responde só com contagens.
 */
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await recordJob("manutencao", executarManutencao), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json({ status: "failed", incident }, { status: 503 });
  }
}
