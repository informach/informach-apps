import { NovoConviteSchema } from "@informach/recreio/contrato";
import { criarConvite } from "@/features/mundos/service";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Gera um convite para o mundo. O código aparece só nesta resposta. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    const { id } = await params;
    return json(await criarConvite(sessao, id, await corpoJson(request, NovoConviteSchema, 2048)));
  });
}
