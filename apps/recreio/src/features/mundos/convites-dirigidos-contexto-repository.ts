import "server-only";
import { and, db, eq, ne, sql } from "@informach/db";
import {
  recreioDirectedInviteWorldApprovals as approvals,
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId, type PerfilId, PerfilIdSchema } from "@informach/recreio";
import {
  admitirAparelhoAtual,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import {
  type AutorDeMundos,
  comAutorDeMundos,
} from "@/features/autoridade-de-jogo/mundos-repository";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  type ComposicaoSocial,
  ComposicaoSocialMudou,
  travarComposicaoDeConvite,
} from "@/features/social/composicao-repository";
import { admitirPerfilSocial } from "@/features/social/perfis-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

export type PontasDeConvite = {
  mundoId: MundoId;
  origemId: PerfilId;
  destinoId: PerfilId;
  conviteId?: string;
  pedidoId?: string;
};
type PerfilAdmitido = Awaited<ReturnType<typeof admitirPerfilSocial>>;
export type ContextoDeConvite = {
  mundo: typeof spaces.$inferSelect;
  composicao: ComposicaoSocial;
  origem: PerfilAdmitido;
  destino: PerfilAdmitido;
  contaId: string | null;
  conferirPrazo: () => Promise<Date>;
};

export async function travarMundoDoConvite(tx: Transacao, pontas: PontasDeConvite) {
  const [mundo] = await tx
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, pontas.mundoId), ne(spaces.status, "deleted")))
    .for("update");
  if (!mundo) throw new ErroDoRecreio("CONVITE_INVALIDO");
  return mundo;
}

type AutoridadeDoConvite = { contaId: string | null; conferirPrazo: () => Promise<Date> };
async function comAutorAdmitido<T>(
  autor: AutorDeMundos,
  jogo: string,
  antesDoPerfil: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, admissao: AutoridadeDoConvite) => Promise<T>,
  opcoes: { antesDaIdentidade: (tx: Transacao, referencia: ReferenciaDeJogador) => Promise<void> },
  leitura: boolean,
): Promise<T> {
  if (!leitura || "sid" in autor)
    return comAutorDeMundos(autor, jogo, antesDoPerfil, executar, opcoes);
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await opcoes.antesDaIdentidade(tx, autor);
    const identidade = await prepararIdentidadeDoJogo(tx, autor);
    await antesDoPerfil(tx);
    const admissao = await admitirAparelhoAtual(
      tx,
      { ...autor, expiraEm: null },
      identidade,
      async () => {},
    );
    if (!admissao.admitida) return admissao;
    const valor = await executar(tx, admissao);
    await admissao.conferirPrazo();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

/** Contas das pontas → mundo → perfis. As duas finalidades têm entradas explícitas abaixo. */
async function comContextoDeConvite<T>(
  autor: AutorDeMundos,
  pontas: PontasDeConvite,
  executar: (tx: Transacao, ctx: ContextoDeConvite) => Promise<T>,
  leitura: boolean,
) {
  assertAllowed(
    pontas.origemId !== pontas.destinoId &&
      (autor.perfilId === pontas.origemId || autor.perfilId === pontas.destinoId),
    "PEDIDO",
    "Convite não disponível.",
  );
  const filtroHistorico = pontas.conviteId
    ? eq(invites.id, pontas.conviteId)
    : pontas.pedidoId
      ? eq(invites.clientKey, pontas.pedidoId)
      : undefined;
  const [historico] = filtroHistorico
    ? await db
        .select({ id: invites.id })
        .from(invites)
        .where(
          and(
            eq(invites.spaceId, pontas.mundoId),
            eq(invites.originProfileId, pontas.origemId),
            eq(invites.targetProfileId, pontas.destinoId),
            filtroHistorico,
          ),
        )
    : [];
  const [emissor] =
    !pontas.conviteId && autor.perfilId === pontas.origemId
      ? await db
          .select({ id: members.id })
          .from(members)
          .where(
            and(
              eq(members.spaceId, pontas.mundoId),
              eq(members.profileId, autor.perfilId),
              eq(members.state, "active"),
            ),
          )
      : [];
  assertAllowed(historico || emissor, "PEDIDO", "Convite não disponível.");
  const [pista] = await db
    .select({ jogo: spaces.gameId })
    .from(spaces)
    .where(eq(spaces.id, pontas.mundoId));
  if (!pista) throw new ErroDoRecreio("CONVITE_INVALIDO");
  if (!leitura || "sid" in autor) jogoQueAbre(pista.jogo);
  const tentar = async () => {
    let composicao: ComposicaoSocial | undefined;
    const [anterior] =
      !pontas.conviteId && pontas.pedidoId
        ? await db
            .select({ id: invites.id })
            .from(invites)
            .where(
              and(
                eq(invites.originProfileId, pontas.origemId),
                eq(invites.clientKey, pontas.pedidoId),
                eq(invites.spaceId, pontas.mundoId),
                eq(invites.targetProfileId, pontas.destinoId),
              ),
            )
        : [];
    const conviteId = pontas.conviteId ?? anterior?.id;
    const [gestor] = conviteId
      ? await db
          .select({ perfilId: members.profileId })
          .from(approvals)
          .innerJoin(
            members,
            and(
              eq(members.spaceId, approvals.spaceId),
              eq(members.id, approvals.approvedByMemberId),
            ),
          )
          .where(eq(approvals.inviteId, conviteId))
      : [];
    const perfilGestor = gestor?.perfilId ? PerfilIdSchema.parse(gestor.perfilId) : null;
    const resultado = await comAutorAdmitido(
      autor,
      pista.jogo,
      async () => {},
      async (tx, admissao) => {
        assertAllowed(composicao, "AUTH", "Entre novamente para continuar.");
        const [mundo] = await tx.select().from(spaces).where(eq(spaces.id, pontas.mundoId));
        if (!mundo || mundo.gameId !== pista.jogo) throw new ErroDoRecreio("CONVITE_INVALIDO");
        const origem = await admitirPerfilSocial(
          tx,
          composicao,
          pontas.origemId,
          await admissao.conferirPrazo(),
        );
        const destino = await admitirPerfilSocial(
          tx,
          composicao,
          pontas.destinoId,
          await admissao.conferirPrazo(),
        );
        if (origem.recalculou || destino.recalculou)
          return {
            executou: false as const,
            erro: new AppError(
              "CONFLITO",
              "As regras mudaram. Confira o convite antes de continuar.",
            ),
          };
        const conferirPrazo = async () => {
          const agora = await admissao.conferirPrazo();
          origem.conferirPrazo(agora);
          destino.conferirPrazo(agora);
          return agora;
        };
        const valor = await executar(tx, {
          mundo,
          composicao,
          origem,
          destino,
          contaId: admissao.contaId,
          conferirPrazo,
        });
        await conferirPrazo();
        return { executou: true as const, valor };
      },
      {
        antesDaIdentidade: async (tx, referencia) => {
          composicao = await travarComposicaoDeConvite(
            tx,
            { tipo: "jogador", referencia },
            [
              ...new Set([
                pontas.origemId,
                pontas.destinoId,
                ...(perfilGestor ? [perfilGestor] : []),
              ]),
            ],
            async () => {
              await travarMundoDoConvite(tx, pontas);
            },
          );
        },
      },
      leitura,
    );
    if (!resultado.executou) throw resultado.erro;
    return resultado.valor;
  };
  try {
    return await tentar();
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar();
  }
}

/** Emissão e aceite mantêm admissão de jogo e cobertura na transação. */
export function comJogadorNoConvite<T>(
  autor: AutorDeMundos,
  pontas: PontasDeConvite,
  executar: (tx: Transacao, ctx: ContextoDeConvite) => Promise<T>,
) {
  return comContextoDeConvite(autor, pontas, executar, false);
}
/** Leitura nativa não exige assinatura; bearer continua preso à autoridade do SID atual. */
export function comLeitorDoConvite<T>(
  autor: AutorDeMundos,
  pontas: PontasDeConvite,
  executar: (tx: Transacao, ctx: ContextoDeConvite) => Promise<T>,
) {
  return comContextoDeConvite(autor, pontas, executar, true);
}
