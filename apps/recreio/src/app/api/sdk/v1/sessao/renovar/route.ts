import { renovarSessao } from "@/features/sessao-de-jogo/service";
import { json, responder, tokenDoPedido } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renova a sessão de jogo do token apresentado, ou a encerra se o acesso caiu. */
export function POST(request: Request) {
  return responder(async () => json(await renovarSessao(tokenDoPedido(request))));
}
