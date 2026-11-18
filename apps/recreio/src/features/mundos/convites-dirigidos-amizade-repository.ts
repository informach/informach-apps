import "server-only";
import { faixaPermite } from "@informach/config/jogos";
import { and, eq, or, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioSpaceMembers as members,
} from "@informach/db/schema";
import {
  type AprovacaoSocial,
  amizadeDisponivel,
  ContaIdSchema,
  type PerfilId,
  type PerfilSocial,
} from "@informach/recreio";
import { jogoQueAbre } from "@/features/jogos/config";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoDeConvite } from "./convites-dirigidos-contexto-repository";
import { mundoCompativel } from "./politica";

/** Perfis das duas pontas já estão travados; leitura não vira busca pública. */
export async function amizadeAtualDoConvite(tx: Transacao, ctx: ContextoDeConvite) {
  return amizadeAtualEntre(tx, ctx.origem.fato, ctx.destino.fato);
}

export async function amizadeAtualEntre(tx: Transacao, a: PerfilSocial, b: PerfilSocial) {
  const menor = a.id < b.id ? a.id : b.id,
    maior = a.id < b.id ? b.id : a.id;
  const [amizade] = await tx
    .select()
    .from(friends)
    .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
  const bloqueios = await tx
    .select({ id: blocks.actorProfileId })
    .from(blocks)
    .where(
      and(
        eq(blocks.blocked, true),
        or(
          and(eq(blocks.actorProfileId, a.id), eq(blocks.targetProfileId, b.id)),
          and(eq(blocks.actorProfileId, b.id), eq(blocks.targetProfileId, a.id)),
        ),
      ),
    )
    .limit(1);
  const aprovacoes = amizade?.requestId
    ? await tx.select().from(consents).where(eq(consents.requestId, amizade.requestId))
    : [];
  const aprovacao = (perfilId: PerfilId): AprovacaoSocial | null => {
    const r = aprovacoes.find((p) => p.profileId === perfilId);
    return r?.approvedByUserId
      ? {
          perfilId,
          contaId: ContaIdSchema.parse(r.approvedByUserId),
          vinculoId: r.guardianLinkId,
          geracao: r.accessGeneration,
        }
      : null;
  };
  assertAllowed(
    amizade &&
      amizadeDisponivel(a, b, {
        amizadeAceita: amizade.state === "active",
        bloqueadoPorUmaDasPartes: bloqueios.length > 0,
        aprovacaoDaOrigem: aprovacao(a.id),
        aprovacaoDoDestino: aprovacao(b.id),
      }),
    "PEDIDO",
    "Convite não disponível para este contato.",
  );
  assertAllowed(
    (a.tipo === "adulto" && b.tipo === "adulto") || env.RECREIO_FAMILY_MODE === "play",
    "PEDIDO",
    "Convite não disponível para este contato.",
  );
  return amizade;
}

/** Convite também respeita a classificação do título e a política do conteúdo do mundo. */
export async function conferirConteudoDoConvite(tx: Transacao, ctx: ContextoDeConvite) {
  const manifesto = jogoQueAbre(ctx.mundo.gameId);
  const [contagem] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.state, "active")));
  for (const atual of [ctx.origem, ctx.destino]) {
    const politica = atual.politicaDeJogo;
    assertAllowed(
      !politica ||
        (politica.reconhecida &&
          !politica.politica.pausado &&
          faixaPermite(politica.politica.faixa, manifesto.classificacao.faixa) &&
          mundoCompativel(manifesto, politica.politica, {
            politicaDeConteudo: ctx.mundo.contentPolicy,
            membros: (contagem?.total ?? 0) + 1,
          })),
      "PEDIDO",
      "O convite não é compatível com as regras atuais.",
    );
  }
  return { manifesto, membros: contagem?.total ?? 0 };
}
