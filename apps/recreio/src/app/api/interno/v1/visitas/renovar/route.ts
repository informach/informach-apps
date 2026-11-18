import { RenovacaoDeVisitasSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { traduzirRecusaDeVisita } from "@/features/visitas/http";
import { renovarVisitas } from "@/features/visitas/renovacao-service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    return json(
      await renovarVisitas(host, await corpoJson(request, RenovacaoDeVisitasSchema, 32768)).catch(
        traduzirRecusaDeVisita,
      ),
    );
  });
}
