import { LiberarPosseSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { liberar } from "@/features/posse/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A instância solta a posse do mundo, que volta a hibernar. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    await liberar(host, (await params).id, await corpoJson(request, LiberarPosseSchema, 1024));
    return json({});
  });
}
