import { BatimentoSchema } from "@informach/recreio/contrato";
import { hostDoCaminho } from "@/features/posse/http";
import { batimento } from "@/features/posse/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renova as posses da instância e devolve as sessões de jogo encerradas desde o cursor. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoCaminho(request, (await params).id);
    return json(await batimento(host, await corpoJson(request, BatimentoSchema, 262_144)));
  });
}
