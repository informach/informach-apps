import { sairDaSessao } from "@/features/sessao-de-jogo/service";
import { json, responder, tokenDoPedido } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Encerra a sessão de jogo do token apresentado. Repetir não faz nada. */
export function POST(request: Request) {
  return responder(async () => {
    await sairDaSessao(tokenDoPedido(request));
    return json({});
  });
}
