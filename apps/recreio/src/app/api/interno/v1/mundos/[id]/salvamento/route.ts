import { SalvamentoDoHostSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { salvarSessaoDoMundo } from "@/features/salvamento/mundo";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () =>
    json(
      await salvarSessaoDoMundo(
        await hostDoPedido(request),
        (await params).id,
        await corpoJson(request, SalvamentoDoHostSchema, 2048),
      ),
    ),
  );
}
