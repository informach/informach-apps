import { PedidoDeEntradaSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { verificarEntrada } from "@/features/posse/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Confere de novo, no Recreio, o direito de um jogador de entrar no mundo. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    const corpo = await corpoJson(request, PedidoDeEntradaSchema, 1024);
    return json(await verificarEntrada(host, (await params).id, corpo));
  });
}
