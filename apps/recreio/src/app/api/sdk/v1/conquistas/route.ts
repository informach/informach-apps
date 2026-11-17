import { PedidoDeConquistaSchema } from "@informach/recreio/contrato";
import { desbloquearConquista } from "@/features/dados-de-perfil/service";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(
      await desbloquearConquista(sessao, await corpoJson(request, PedidoDeConquistaSchema, 2048)),
    );
  });
}
