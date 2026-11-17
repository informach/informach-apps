import { consultarControleDaSessao } from "@/features/sessao-de-jogo/controle";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => json(await consultarControleDaSessao(await sessaoDeJogo(request))));
}
