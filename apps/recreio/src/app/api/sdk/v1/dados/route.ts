import { MutacaoDeDadosSchema } from "@informach/recreio/contrato";
import { alterarDados, consultarDados } from "@/features/dados-de-perfil/service";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    const consulta = new URL(request.url).searchParams;
    return json(
      await consultarDados(sessao, consulta.get("chave"), consulta.get("historico") === "1"),
    );
  });
}

export function POST(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(
      await alterarDados(sessao, await corpoJson(request, MutacaoDeDadosSchema, 90 * 1024)),
    );
  });
}
