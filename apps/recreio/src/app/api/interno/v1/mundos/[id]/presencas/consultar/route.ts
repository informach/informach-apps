import { ConsultaDePresencaSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { traduzirRecusaDePresenca } from "@/features/presencas/http";
import { consultarPresenca } from "@/features/presencas/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request),
      { id } = await params;
    return json(
      await consultarPresenca(
        host,
        id,
        await corpoJson(request, ConsultaDePresencaSchema, 4096),
      ).catch(traduzirRecusaDePresenca),
    );
  });
}
