import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceVisitInvites as invites,
  recreioWorldHostPresences as presences,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
  recreioWorldVisitSessions as visitSessions,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId } from "@informach/recreio";
import type {
  EncerramentoDeSessaoDeVisita,
  SessaoDeVisitaEncerrada,
} from "@informach/recreio/contrato";
import { limitarGestao } from "@/features/mundos/gestao-repository";
import type { Host } from "@/features/posse/service";
import {
  encerrarSessoesAbertas,
  travarEncerramentos,
} from "@/features/sessao-de-jogo/encerramento-repository";
import type { Transacao } from "@/lib/repository";

/** Prova histórica, sem conceder autoridade ao sucessor ou exigir que ela ainda esteja vigente. */
async function temSucessorComCheckpoint(
  tx: Transacao,
  pedido: {
    sid: string;
    perfilId: string;
    visitaId: string;
    mundoId: string;
    cerca: number;
    jogo: string;
  },
) {
  const [prova] = await tx.execute<{ existe: boolean }>(sql`
    select exists (
      select 1 from recreio.session_handoffs h
      join recreio.game_tickets t on t.jti=h.ticket_jti
      join recreio.game_sessions anterior on anterior.id=h.from_session_id
      join recreio.game_sessions sucessor on sucessor.id=t.opened_session_id
      join recreio.world_visit_sessions v on v.session_id=sucessor.id
      where h.from_session_id=${pedido.sid}::uuid and h.profile_id=${pedido.perfilId}::uuid
        and h.mode='server' and h.status='completed' and h.finished_at is not null
        and h.confirmed_at is not null and h.confirmed_at=anterior.checkpoint_frozen_at
        and anterior.end_reason='replaced' and anterior.ended_at is not null
        and h.checkpoint_space_id=${pedido.mundoId}::uuid and h.checkpoint_fence=${pedido.cerca}
        and v.visit_id=${pedido.visitaId}::uuid and v.profile_id=${pedido.perfilId}::uuid
        and v.space_id=${pedido.mundoId}::uuid and sucessor.profile_id=v.profile_id
        and sucessor.game_id=${pedido.jogo} and t.game_id=sucessor.game_id
        and t.profile_id=v.profile_id and t.device_session_id=sucessor.device_session_id
        and h.to_device_session_id=sucessor.device_session_id and t.consumed_at is not null
    ) as existe
  `);
  return prova?.existe === true;
}

/** Só a instância/cerca da presença original pode encerrar este vínculo/SID. Funciona após perda de acesso. */
export function encerrarSessaoDeVisitaNoBanco(
  host: Host,
  mundoId: MundoId,
  pedido: EncerramentoDeSessaoDeVisita,
): Promise<SessaoDeVisitaEncerrada> {
  return db.transaction(async (tx): Promise<SessaoDeVisitaEncerrada> => {
    await limitarGestao(tx);
    const [mundo] = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, host.jogo)))
      .for("update");
    if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const [pista] = await tx
      .select({ vinculo: visitSessions, visita: visits, presenca: presences })
      .from(visitSessions)
      .innerJoin(visits, eq(visits.id, visitSessions.visitId))
      .innerJoin(presences, eq(presences.id, visits.hostPresenceId))
      .where(
        and(
          eq(visitSessions.id, pedido.sessaoDeVisitaId),
          eq(visitSessions.sessionId, pedido.sid),
          eq(visitSessions.profileId, pedido.perfilId),
          eq(visitSessions.spaceId, mundoId),
          eq(visits.id, pedido.visitaId),
          eq(presences.instanceId, host.instanciaId),
          eq(presences.fence, pedido.cerca),
        ),
      );
    if (!pista) throw new ErroDoRecreio("NAO_ENCONTRADO");
    // Nenhuma linha de game_sessions é tomada antes do cursor global.
    const [perfil] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, pedido.perfilId))
      .for("update");
    if (!perfil) throw new Error("Sessão visitante sem perfil correspondente.");
    const [raiz] = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.id, pista.visita.inviteId))
      .for("share");
    if (!raiz) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const [visita] = await tx
        .select()
        .from(visits)
        .where(eq(visits.id, pista.visita.id))
        .for("update"),
      [vinculo] = await tx
        .select()
        .from(visitSessions)
        .where(eq(visitSessions.id, pista.vinculo.id))
        .for("update");
    if (!visita || !vinculo) throw new Error("Vínculo visitante mudou sob a trava de seu mundo.");
    await travarEncerramentos(tx);
    const [sessao] = await tx.select().from(games).where(eq(games.id, pedido.sid)).for("update"),
      [instante] = await tx
        .select({ agora: sql<Date>`clock_timestamp()`.mapWith(spaces.createdAt) })
        .from(spaces)
        .where(eq(spaces.id, mundoId));
    if (!sessao || !instante || sessao.profileId !== pedido.perfilId || sessao.gameId !== host.jogo)
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const agora = instante.agora;
    const substituida =
      (vinculo.state === "closed" && vinculo.closeReason === "replaced") ||
      (sessao.endReason === "replaced" &&
        (await temSucessorComCheckpoint(tx, {
          ...pedido,
          mundoId,
          jogo: host.jogo,
        })));
    const [outra] =
      vinculo.admittedAt === null && sessao.endedAt !== null
        ? await tx.execute<{ id: string }>(sql`
        select v.id from recreio.world_visit_sessions v join recreio.game_sessions g on g.id=v.session_id
        where v.visit_id=${visita.id}::uuid and v.id<>${vinculo.id}::uuid and v.state<>'closed'
          and g.ended_at is null limit 1
      `)
        : [];
    if (sessao.endedAt === null)
      await encerrarSessoesAbertas(
        tx,
        sql`${games.id}=${pedido.sid}`,
        sessao.expiresAt <= agora ? "expired" : pedido.motivo === "sair" ? "left" : "access_lost",
        { porQuem: "recreio" },
      );
    let visitaEncerrada = visita.endedAt !== null;
    if (!substituida && !outra && !visitaEncerrada) {
      const expirada = visita.expiresAt <= agora,
        motivo = expirada ? "expired" : pedido.motivo === "sair" ? "left" : "revoked";
      await tx
        .update(visits)
        .set({
          state: expirada ? "expired" : "revoked",
          endedAt: agora,
          updatedAt: agora,
          endReason: motivo,
        })
        .where(eq(visits.id, visita.id));
      await logAuditEventStrict(
        "recreio.visit_closed",
        null,
        {
          app: "recreio",
          spaceId: mundoId,
          inviteId: visita.inviteId,
          visitId: visita.id,
          profileId: pedido.perfilId,
          reason: motivo,
        },
        { writer: tx },
      );
      visitaEncerrada = true;
    }
    if (vinculo.state !== "closed") {
      const motivo = substituida
        ? "replaced"
        : outra
          ? "session_ended"
          : pedido.motivo === "sair"
            ? "left"
            : "visit_ended";
      await tx
        .update(visitSessions)
        .set({ state: "closed", closedAt: agora, updatedAt: agora, closeReason: motivo })
        .where(eq(visitSessions.id, vinculo.id));
      await logAuditEventStrict(
        "recreio.visit_session_closed",
        null,
        {
          app: "recreio",
          spaceId: mundoId,
          visitId: visita.id,
          sessionId: pedido.sid,
          visitSessionId: vinculo.id,
          profileId: pedido.perfilId,
          reason: motivo,
        },
        { writer: tx },
      );
    }
    const [final] = await tx
      .select({ encerradaEm: games.endedAt })
      .from(games)
      .where(eq(games.id, pedido.sid));
    if (!final?.encerradaEm)
      throw new Error("Encerramento visitante não produziu recibo real do SID.");
    return { sessaoDeVisitaId: vinculo.id, estado: "closed", sidEncerrado: true, visitaEncerrada };
  });
}
