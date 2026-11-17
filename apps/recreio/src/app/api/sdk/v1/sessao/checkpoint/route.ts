import { ConfirmacaoDeCheckpointSchema } from "@informach/recreio/contrato";
import { confirmarCheckpoint } from "@/features/sessao-de-jogo/checkpoint";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return responder(async () =>
    json(
      await confirmarCheckpoint(
        await sessaoDeJogo(request),
        await corpoJson(request, ConfirmacaoDeCheckpointSchema, 1024),
      ),
    ),
  );
}
