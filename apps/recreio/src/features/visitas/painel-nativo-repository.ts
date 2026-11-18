import "server-only";
import {
  type MundoId,
  MundoIdSchema,
  type PerfilId,
  PerfilIdSchema,
  UuidSchema,
} from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import {
  aprovacoesDaVisita,
  conferirRevisoesDoConvite,
} from "@/features/mundos/convites-dirigidos-estado-repository";
import {
  type AutorDaGestaoDeMundo,
  identidadeDoGestor,
} from "@/features/mundos/gestao-nativa-autor";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { comDecisorEAnfitriaoNaVisita } from "./contexto-nativo-repository";
import { reciboDoConviteDeVisita } from "./recibos";

async function painel(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  conviteId: string,
  tipo: "responsavel" | "mundo",
  mundoId?: MundoId,
) {
  await limitarTentativas({
    chave: `visita-painel-nativo:${autor.contaId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comDecisorEAnfitriaoNaVisita(
    autor,
    conviteId,
    { tipo, perfilId },
    async (tx, ctx, convite, _decisor, anfitriao) => {
      assertAllowed(
        !mundoId || ctx.mundo.id === mundoId,
        "PEDIDO",
        "Convite não disponível neste mundo.",
      );
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      conferirRevisoesDoConvite(ctx, convite, amizade.revision);
      await conferirConteudoDoConvite(tx, ctx);
      const agora = await anfitriao.conferirPrazo();
      assertAllowed(
        convite.state === "pending" && convite.expiresAt > agora && convite.retainUntil > agora,
        "PEDIDO",
        "O convite não está mais disponível. Confira o recibo.",
      );
      const aprovacoes = await aprovacoesDaVisita(tx, ctx, convite),
        origem = ctx.composicao.perfis.find((p) => p.id === convite.originProfileId),
        destino = ctx.composicao.perfis.find((p) => p.id === convite.targetProfileId),
        perfil = ctx.composicao.perfis.find((p) => p.id === perfilId);
      assertAllowed(origem && destino && perfil, "PEDIDO", "Convite não disponível.");
      const fim = await anfitriao.conferirPrazo();
      assertAllowed(
        convite.expiresAt > fim && convite.retainUntil > fim,
        "PEDIDO",
        "O convite venceu.",
      );
      return {
        convite: {
          ...reciboDoConviteDeVisita(convite, ctx.mundo.gameId),
          aguardaMundo: !aprovacoes.mundo,
          aguardaOrigem: !aprovacoes.origem,
          aguardaDestino: !aprovacoes.destino,
        },
        nomeDoMundo: ctx.mundo.name,
        origem: { apelido: origem.nickname, avatar: origem.avatar },
        destino: { apelido: destino.nickname, avatar: destino.avatar },
        versaoDaPolitica: perfil.policyVersion,
        versaoDaGestao: ctx.mundo.managementRevision,
        aguardaSuaAprovacao:
          tipo === "mundo"
            ? !aprovacoes.mundo
            : perfilId === convite.originProfileId
              ? !aprovacoes.origem
              : !aprovacoes.destino,
      };
    },
    true,
  );
}

/** Leitura nativa gratuita do responsável atual; não requer que ele tenha jogador. */
export function painelDaVisitaDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  conviteId: unknown,
) {
  return painel(autor, PerfilIdSchema.parse(perfilId), UuidSchema.parse(conviteId), "responsavel");
}
export function painelDaVisitaNoMundo(
  autor: AutorDaGestaoDeMundo,
  mundoId: unknown,
  conviteId: unknown,
) {
  return painel(
    identidadeDoGestor(autor),
    autor.perfilId,
    UuidSchema.parse(conviteId),
    "mundo",
    MundoIdSchema.parse(mundoId),
  );
}
