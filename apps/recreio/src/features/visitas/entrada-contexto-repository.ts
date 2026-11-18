import "server-only";
import { and, db, eq } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioGameSessions as sessions,
  recreioWorldVisitSessions as visitSessions,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import type { ContextoDeConvite } from "@/features/mundos/convites-dirigidos-contexto-repository";
import {
  aprovacoesDaVisita,
  conferirRevisoesDoConvite,
} from "@/features/mundos/convites-dirigidos-estado-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type AnfitriaoAdmitido, comJogadorEAnfitriaoNaVisita } from "./contexto-repository";

async function conferirNoContexto(
  tx: Transacao,
  ctx: ContextoDeConvite,
  anfitriao: AnfitriaoAdmitido,
  autor: SessaoDeJogoAtiva,
  pista: { visitaId: string; conviteId: string },
) {
  const [convite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, pista.conviteId))
      .for("share"),
    [visita] = await tx.select().from(visits).where(eq(visits.id, pista.visitaId)).for("update"),
    [intencao] = await tx
      .select()
      .from(visitSessions)
      .where(eq(visitSessions.sessionId, autor.sid))
      .for("update"),
    [sessao] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, autor.sid))
      .for("no key update"),
    [perfil] = await tx.select().from(profiles).where(eq(profiles.id, autor.perfilId)),
    agora = await anfitriao.conferirPrazo();
  assertAllowed(
    convite &&
      visita &&
      intencao &&
      sessao &&
      perfil &&
      convite.state === "accepted" &&
      convite.spaceId === ctx.mundo.id &&
      convite.targetProfileId === autor.perfilId &&
      convite.originProfileId === ctx.origem.fato.id &&
      convite.hostPresenceId === anfitriao.presenca.id &&
      visita.inviteId === convite.id &&
      visita.spaceId === ctx.mundo.id &&
      visita.visitorProfileId === autor.perfilId &&
      visita.hostPresenceId === anfitriao.presenca.id &&
      visita.state === "active" &&
      visita.endedAt === null &&
      visita.expiresAt > agora &&
      intencao.visitId === visita.id &&
      intencao.profileId === autor.perfilId &&
      intencao.spaceId === ctx.mundo.id &&
      intencao.state !== "closed" &&
      sessao.profileId === autor.perfilId &&
      sessao.gameId === autor.jogo &&
      sessao.endedAt === null &&
      sessao.expiresAt > agora &&
      sessao.supportsVisits &&
      sessao.checkpointFrozenAt === null &&
      (sessao.spaceId === null || sessao.spaceId === ctx.mundo.id),
    "PEDIDO",
    "Visita não disponível.",
  );
  const [membro] = await tx
    .select({ estado: members.state })
    .from(members)
    .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.profileId, autor.perfilId)));
  if (membro && membro.estado !== "former") throw new ErroDoRecreio("JA_MEMBRO");
  const amizade = await amizadeAtualDoConvite(tx, ctx);
  conferirRevisoesDoConvite(ctx, convite, amizade.revision);
  await conferirConteudoDoConvite(tx, ctx);
  const aprovacoes = await aprovacoesDaVisita(tx, ctx, convite);
  assertAllowed(
    aprovacoes.mundo && aprovacoes.origem && aprovacoes.destino,
    "PEDIDO",
    "A visita precisa das aprovações atuais.",
  );
  const conferirPrazo = async () => {
    const instante = await anfitriao.conferirPrazo();
    if (
      visita.expiresAt <= instante ||
      sessao.expiresAt <= instante ||
      autor.expiraEm <= instante.getTime()
    )
      throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "expired" });
    return instante;
  };
  await conferirPrazo();
  return { ctx, anfitriao, convite, visita, intencao, sessao, perfil, conferirPrazo };
}
export type EntradaDeVisitaAdmitida = Awaited<ReturnType<typeof conferirNoContexto>>;

/** O ingresso/SID só recebe autoridade de mundo após a composição atual completa. */
export async function comSessaoVisitanteAtual<T>(
  autor: SessaoDeJogoAtiva,
  visitaId: string,
  executar: (tx: Transacao, entrada: EntradaDeVisitaAdmitida) => Promise<T>,
) {
  const [pista] = await db
    .select({ visita: visits, convite: invites })
    .from(visits)
    .innerJoin(invites, eq(invites.id, visits.inviteId))
    .where(and(eq(visits.id, visitaId), eq(visits.visitorProfileId, autor.perfilId)));
  if (!pista) throw new ErroDoRecreio("NAO_ENCONTRADO");
  return comJogadorEAnfitriaoNaVisita(
    autor,
    {
      mundoId: MundoIdSchema.parse(pista.visita.spaceId),
      origemId: PerfilIdSchema.parse(pista.convite.originProfileId),
      destinoId: autor.perfilId,
      conviteId: pista.convite.id,
    },
    pista.visita.hostPresenceId,
    async (tx, ctx, anfitriao) => {
      if (ctx.mundo.gameId !== autor.jogo) throw new ErroDoRecreio("NAO_ENCONTRADO");
      const entrada = await conferirNoContexto(tx, ctx, anfitriao, autor, {
          visitaId,
          conviteId: pista.convite.id,
        }),
        valor = await executar(tx, entrada);
      await entrada.conferirPrazo();
      return valor;
    },
  );
}
