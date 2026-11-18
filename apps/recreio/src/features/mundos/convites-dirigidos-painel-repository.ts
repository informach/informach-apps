import "server-only";
import {
  type MundoId,
  MundoIdSchema,
  type PerfilId,
  PerfilIdSchema,
  UuidSchema,
} from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "./convites-dirigidos-amizade-repository";
import {
  aprovacoesDoConvite,
  conferirRevisoesDoConvite,
  resumoDoConvite,
} from "./convites-dirigidos-estado-repository";
import { comDecisorNativoDoConvite } from "./convites-dirigidos-nativo-repository";
import { type AutorDaGestaoDeMundo, identidadeDoGestor } from "./gestao-nativa-autor";

async function painel(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  conviteId: string,
  tipo: "responsavel" | "mundo",
  mundoId?: MundoId,
) {
  await limitarTentativas({
    chave: `convite-dirigido-painel:${autor.contaId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comDecisorNativoDoConvite(
    autor,
    conviteId,
    { tipo, perfilId },
    async (tx, ctx, convite) => {
      assertAllowed(
        !mundoId || ctx.mundo.id === mundoId,
        "PEDIDO",
        "Convite não disponível neste mundo.",
      );
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      conferirRevisoesDoConvite(ctx, convite, amizade.revision);
      await conferirConteudoDoConvite(tx, ctx);
      assertAllowed(
        convite.state === "pending" &&
          convite.expiresAt > (await ctx.conferirPrazo()) &&
          (ctx.mundo.status === "active" || ctx.mundo.status === "hibernating"),
        "PEDIDO",
        "O convite não está mais disponível.",
      );
      const origem = ctx.composicao.perfis.find((p) => p.id === convite.originProfileId),
        destino = ctx.composicao.perfis.find((p) => p.id === convite.targetProfileId),
        perfil = ctx.composicao.perfis.find((p) => p.id === perfilId);
      assertAllowed(origem && destino && perfil, "PEDIDO", "Convite não disponível.");
      const resumo = resumoDoConvite(
        convite,
        ctx.mundo.gameId,
        await aprovacoesDoConvite(tx, ctx, convite),
      );
      const aguardaSuaAprovacao =
        tipo === "mundo"
          ? resumo.aguardaMundo
          : perfilId === convite.originProfileId
            ? resumo.aguardaOrigem
            : resumo.aguardaDestino;
      return {
        convite: resumo,
        nomeDoMundo: ctx.mundo.name,
        origem: { apelido: origem.nickname, avatar: origem.avatar },
        destino: { apelido: destino.nickname, avatar: destino.avatar },
        versaoDaPolitica: perfil.policyVersion,
        versaoDaGestao: ctx.mundo.managementRevision,
        aguardaSuaAprovacao,
      };
    },
    true,
  );
}

/** Os nomes só são exibidos depois de reler a amizade e a responsabilidade atuais. */
export function painelDoConviteDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  conviteId: unknown,
) {
  return painel(autor, PerfilIdSchema.parse(perfilId), UuidSchema.parse(conviteId), "responsavel");
}
export function painelDoConviteNoMundo(
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
