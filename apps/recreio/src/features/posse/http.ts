import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { CABECALHO_DA_INSTANCIA, CABECALHO_DO_JOGO } from "@informach/recreio/contrato";
import { segredoDoHost } from "@/features/jogos/config";
import { segredoConfere, tokenDoPedido } from "@/lib/http";
import { type Host, instanciaRegistrada } from "./service";

/**
 * Autenticação da API das instâncias (`/api/interno/v1`): o servidor de um
 * jogo manda o segredo do jogo em `Authorization: Bearer` e o id do jogo em
 * `X-Recreio-Jogo`. Não há cookie nem conferência de origem aqui: quem chama é
 * um servidor, não um navegador.
 *
 * O segredo de um jogo só alcança o que é daquele jogo. Segredo errado, jogo
 * sem segredo configurado e cabeçalho ausente dão a mesma recusa.
 */

/** Comparado quando o jogo não tem segredo, para a resposta levar o mesmo tempo. */
const SEGREDO_AUSENTE = "segredo-ausente-".repeat(4);

/** O jogo do segredo apresentado, ou `NAO_AUTENTICADO`. */
export function jogoDoHost(request: Request): string {
  const jogo = request.headers.get(CABECALHO_DO_JOGO) ?? "";
  const esperado = segredoDoHost(jogo);
  const confere = segredoConfere(tokenDoPedido(request) ?? "", esperado ?? SEGREDO_AUSENTE);
  if (esperado === null || !confere) throw new ErroDoRecreio("NAO_AUTENTICADO");
  return jogo;
}

/** O jogo e a instância do pedido: a instância de `X-Recreio-Instancia` precisa ser deste jogo. */
export function hostDoPedido(request: Request): Promise<Host> {
  return instanciaRegistrada(jogoDoHost(request), request.headers.get(CABECALHO_DA_INSTANCIA));
}

/**
 * Nas rotas `/instancias/{id}`: a instância do caminho precisa ser deste jogo
 * e, se o cabeçalho veio, ser a mesma dele.
 */
export async function hostDoCaminho(request: Request, instanciaId: string): Promise<Host> {
  const jogo = jogoDoHost(request);
  const doCabecalho = request.headers.get(CABECALHO_DA_INSTANCIA);
  if (doCabecalho !== null && doCabecalho !== instanciaId)
    throw new ErroDoRecreio("NAO_AUTENTICADO");
  return instanciaRegistrada(jogo, instanciaId);
}
