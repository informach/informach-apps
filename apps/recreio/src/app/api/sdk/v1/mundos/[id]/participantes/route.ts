import { participantesDoMundo } from "@/features/mundos/participantes-repository";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { traduzirRecusaSocial } from "@/features/social/http";
import { json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    const { id } = await params;
    return json(
      await participantesDoMundo(sessao, {
        ...ConsultaSocialSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
        mundoId: id,
      }).catch(traduzirRecusaSocial),
    );
  });
}

import { ConsultaSocialSchema } from "@informach/recreio/contrato";
