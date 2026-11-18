import { PedidoDeAberturaDeVisitaSchema } from "@informach/recreio/contrato";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { abrirVisita } from "@/features/visitas/entrada-service";
import { traduzirRecusaDeVisita } from "@/features/visitas/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return responder(async () => {
    const autor = await sessaoDeJogo(request);
    return json(
      await abrirVisita(
        autor,
        await corpoJson(request, PedidoDeAberturaDeVisitaSchema, 4096),
      ).catch(traduzirRecusaDeVisita),
    );
  });
}
