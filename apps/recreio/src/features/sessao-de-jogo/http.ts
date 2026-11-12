import "server-only";
import { tokenDoPedido } from "@/lib/http";
import { type SessaoDeJogoAtiva, sessaoDeJogoDoToken } from "./service";

/**
 * Quem está pedindo, nas rotas do SDK: o perfil, a sessão de jogo e o jogo,
 * tirados do token em `Authorization: Bearer` e conferidos contra a linha da
 * sessão, que precisa continuar aberta. Recusa com `SESSAO_INVALIDA` ou
 * `SESSAO_ENCERRADA`.
 */
export function sessaoDeJogo(request: Request): Promise<SessaoDeJogoAtiva> {
  return sessaoDeJogoDoToken(tokenDoPedido(request));
}
