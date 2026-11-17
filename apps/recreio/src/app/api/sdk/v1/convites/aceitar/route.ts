import { ErroDoRecreio } from "@informach/recreio";
import { AceiteDeConviteSchema } from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { aceitarConvite } from "@/features/mundos/service";
import { perfilAtivo } from "@/features/sessao/ator";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, mesmaOrigem, responder, tokenDoPedido } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Aceita um convite para o perfil de quem pede: o da sessão de jogo, se o
 * pedido traz o token, ou o perfil ativo do portal, pelo cookie (e aí só da
 * própria origem). O corpo leva só o código.
 */
export function POST(request: Request) {
  return responder(async () => {
    let autor: AutorDeMundos;
    if (tokenDoPedido(request) !== null) autor = await sessaoDeJogo(request);
    else {
      if (!mesmaOrigem(request)) throw new ErroDoRecreio("ACESSO_NEGADO", { motivo: "origem" });
      const ator = await perfilAtivo();
      autor = { perfilId: ator.perfil.id, sessaoDeAparelhoId: ator.sessaoDeAparelhoId };
    }
    const aceito = await aceitarConvite(
      autor,
      await corpoJson(request, AceiteDeConviteSchema, 1024),
    );
    return json({ id: aceito.mundoId, nome: aceito.nome });
  });
}
