import { RegistroDeInstanciaSchema } from "@informach/recreio/contrato";
import { jogoDoHost } from "@/features/posse/http";
import { registrar } from "@/features/posse/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Uma instância de servidor de jogo se registra e recebe o intervalo do batimento. */
export function POST(request: Request) {
  return responder(async () => {
    const jogo = jogoDoHost(request);
    return json(await registrar(jogo, await corpoJson(request, RegistroDeInstanciaSchema, 2048)));
  });
}
