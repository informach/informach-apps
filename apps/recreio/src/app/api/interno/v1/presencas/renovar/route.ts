import { RenovacaoDePresencasSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { traduzirRecusaDePresenca } from "@/features/presencas/http";
import { renovarPresencas } from "@/features/presencas/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    return json(
      await renovarPresencas(
        host,
        await corpoJson(request, RenovacaoDePresencasSchema, 32768),
      ).catch(traduzirRecusaDePresenca),
    );
  });
}
