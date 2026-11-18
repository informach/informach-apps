import "server-only";
import { and, db, eq } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioProfiles as profiles,
  recreioGameSessions as sessions,
  recreioWorldVisitSessions as visitSessions,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { ContextoDeConvite } from "@/features/mundos/convites-dirigidos-contexto-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { carregarConcessaoDaVisita, conferirConcessaoDaVisita } from "./concessao-atual-repository";
import { type AnfitriaoAdmitido, comJogadorEAnfitriaoNaVisita } from "./contexto-repository";

async function conferirNoContexto(
  tx: Transacao,
  ctx: ContextoDeConvite,
  anfitriao: AnfitriaoAdmitido,
  autor: SessaoDeJogoAtiva,
  pista: { visitaId: string; conviteId: string },
) {
  const { convite, visita } = await carregarConcessaoDaVisita(
    tx,
    ctx,
    anfitriao,
    autor.perfilId,
    pista,
  );
  const [intencao] = await tx
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
    intencao &&
      sessao &&
      perfil &&
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
  const conferirConcessao = await conferirConcessaoDaVisita(tx, ctx, anfitriao, autor.perfilId, {
    convite,
    visita,
  });
  const conferirPrazo = async () => {
    const instante = await conferirConcessao();
    if (sessao.expiresAt <= instante || autor.expiraEm <= instante.getTime())
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
