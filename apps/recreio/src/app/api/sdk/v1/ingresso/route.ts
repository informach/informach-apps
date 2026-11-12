import { ErroDoRecreio } from "@informach/recreio";
import { PedidoDeIngressoSchema } from "@informach/recreio/contrato";
import { perfilAtivo } from "@/features/sessao/ator";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import { corpoJson, json, mesmaOrigem, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Emite o ingresso de abertura de um jogo para o perfil ativo deste aparelho.
 * É a única rota do SDK autenticada pelo cookie do portal, e por isso só
 * atende pedidos da própria origem. O perfil vem da sessão, nunca do corpo.
 */
export function POST(request: Request) {
  return responder(async () => {
    if (!mesmaOrigem(request)) throw new ErroDoRecreio("ACESSO_NEGADO", { motivo: "origem" });
    const pedido = await corpoJson(request, PedidoDeIngressoSchema, 1024);
    return json(await emitirIngresso(await perfilAtivo(), pedido));
  });
}
