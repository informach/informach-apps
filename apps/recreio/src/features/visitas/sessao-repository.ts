import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceVisitInvites as invites,
  recreioWorldHostPresences as presences,
  recreioWorldVisitSessions as sessions,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import { jogoQueAbre } from "@/features/jogos/config";
import { env } from "@/lib/env";
import type { Transacao } from "@/lib/repository";

/** Limite de recibos por concessão; não é capacidade de jogadores simultâneos. */
export const INTENCOES_POR_VISITA = 128;

/**
 * Restrição da própria sessão, sob a trava de seu perfil. Não toma travas de
 * mundo ou da outra família e não admite entrada. A instância deve conferir
 * novamente todas as provas sociais, parentais e do mundo antes de jogar.
 */
export async function prazoDaIntencaoDeVisita(
  tx: Transacao,
  pedido: { visitaId: string; perfilId: string; jogo: string; agora: Date },
) {
  if (
    env.RECREIO_VISITS_MODE !== "on" ||
    env.RECREIO_SOCIAL_MODE !== "on" ||
    jogoQueAbre(pedido.jogo).capacidades.visitas !== true
  )
    throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "permissions_changed" });
  const [v] = await tx
    .select({
      visita: visits,
      convite: invites,
      presenca: presences,
      anfitriao: games,
      mundo: spaces,
    })
    .from(visits)
    .innerJoin(invites, eq(invites.id, visits.inviteId))
    .innerJoin(presences, eq(presences.id, visits.hostPresenceId))
    .innerJoin(games, eq(games.id, presences.hostSessionId))
    .innerJoin(spaces, eq(spaces.id, visits.spaceId))
    .where(and(eq(visits.id, pedido.visitaId), eq(visits.visitorProfileId, pedido.perfilId)));
  if (
    v?.convite.state !== "accepted" ||
    v.visita.state !== "active" ||
    v.visita.endedAt !== null ||
    v.visita.expiresAt <= pedido.agora ||
    v.presenca.state !== "active" ||
    v.presenca.closedAt !== null ||
    v.presenca.expiresAt <= pedido.agora ||
    v.presenca.validUntil <= pedido.agora
  )
    throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "expired" });
  if (v.mundo.gameId !== pedido.jogo || v.anfitriao.gameId !== pedido.jogo)
    throw new ErroDoRecreio("INGRESSO_INVALIDO");
  if (
    v.mundo.status !== "active" ||
    v.anfitriao.endedAt !== null ||
    v.anfitriao.expiresAt <= pedido.agora
  )
    throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "permissions_changed" });
  return {
    visitaId: v.visita.id,
    mundoId: v.visita.spaceId,
    expiraEm: new Date(Math.min(v.visita.expiresAt.getTime(), v.presenca.validUntil.getTime())),
  };
}

export async function finalidadeDaSessao(tx: Transacao, sid: string) {
  const [finalidade] = await tx.select().from(sessions).where(eq(sessions.sessionId, sid));
  return finalidade ?? null;
}

/** Preparada ou encerrada também não pode ser promovida pelo protocolo de membro. */
export async function exigirSessaoSemVisita(tx: Transacao, sid: string) {
  if (await finalidadeDaSessao(tx, sid)) throw new ErroDoRecreio("NAO_MEMBRO");
}

export async function prepararFinalidadeDeVisita(
  tx: Transacao,
  pedido: {
    sid: string;
    perfilId: string;
    visitaId: string;
    mundoId: string;
    agora: Date;
  },
) {
  const [total] = await tx
    .select({ valor: sql<number>`count(*)::integer` })
    .from(sessions)
    .where(eq(sessions.visitId, pedido.visitaId));
  if ((total?.valor ?? 0) >= INTENCOES_POR_VISITA)
    throw new ErroDoRecreio("MUITAS_TENTATIVAS", { motivo: "visit_session_receipts" });
  await tx.insert(sessions).values({
    sessionId: pedido.sid,
    visitId: pedido.visitaId,
    spaceId: pedido.mundoId,
    profileId: pedido.perfilId,
    createdAt: pedido.agora,
    updatedAt: pedido.agora,
  });
}
