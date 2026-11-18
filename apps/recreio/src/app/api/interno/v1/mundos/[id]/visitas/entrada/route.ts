import { PedidoDeEntradaDeVisitaSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { admitirEntradaDeVisita } from "@/features/visitas/entrada-service";
import { traduzirRecusaDeVisita } from "@/features/visitas/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request),
      { id } = await params;
    return json(
      await admitirEntradaDeVisita(
        host,
        id,
        await corpoJson(request, PedidoDeEntradaDeVisitaSchema, 4096),
      ).catch(traduzirRecusaDeVisita),
    );
  });
}
