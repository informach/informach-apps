import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNotNull, isNull } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioProfiles as profiles,
  recreioGameTickets as tickets,
  recreioWorldVisitSessions as visitSessions,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId, MundoIdSchema } from "@informach/recreio";
import type {
  EntradaDeVisitante,
  PedidoDeEntradaDeVisitaSchema,
  VisitaAberta,
} from "@informach/recreio/contrato";
import type { z } from "zod";
import { jogoDoCatalogo } from "@/features/jogos/config";
import type { Host } from "@/features/posse/service";
import { politicaDaAdmissao } from "@/features/sessao-de-jogo/politica";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import type { Transacao } from "@/lib/repository";
import { conferirCapacidadeDeJogadores } from "./capacidade-repository";
import {
  comSessaoVisitanteAtual,
  type EntradaDeVisitaAdmitida,
} from "./entrada-contexto-repository";

/** Apenas orienta o navegador à posse original; não aloca instância nem admite SID. */
export function abrirVisitaNoBanco(
  autor: SessaoDeJogoAtiva,
  visitaId: string,
): Promise<VisitaAberta> {
  return comSessaoVisitanteAtual(
    autor,
    visitaId,
    async (_tx, entrada): Promise<VisitaAberta> => ({
      visitaId: entrada.visita.id,
      mundoId: MundoIdSchema.parse(entrada.ctx.mundo.id),
      onde: "servidor",
      endereco: entrada.anfitriao.instancia.publicUrl,
      schemaVersion: entrada.ctx.mundo.schemaVersion,
      revisao: entrada.ctx.mundo.revision,
    }),
  );
}

/** Uma troca só continua esta concessão se o checkpoint F3 realmente abriu este sucessor. */
async function antecessoraComCheckpoint(tx: Transacao, entrada: EntradaDeVisitaAdmitida) {
  const [prova] = await tx
    .select({ anterior: visitSessions, sessao: games, troca: handoffs })
    .from(handoffs)
    .innerJoin(tickets, eq(tickets.jti, handoffs.ticketJti))
    .innerJoin(games, eq(games.id, handoffs.fromSessionId))
    .innerJoin(
      visitSessions,
      and(eq(visitSessions.sessionId, games.id), eq(visitSessions.visitId, entrada.visita.id)),
    )
    .where(
      and(
        eq(tickets.openedSessionId, entrada.sessao.id),
        eq(tickets.profileId, entrada.perfil.id),
        eq(tickets.deviceSessionId, entrada.sessao.deviceSessionId),
        eq(tickets.gameId, entrada.sessao.gameId),
        isNotNull(tickets.consumedAt),
        eq(handoffs.profileId, entrada.perfil.id),
        eq(handoffs.toDeviceSessionId, entrada.sessao.deviceSessionId),
        eq(handoffs.policyVersion, entrada.perfil.policyVersion),
        eq(handoffs.mode, "server"),
        eq(handoffs.status, "completed"),
        eq(handoffs.checkpointSpaceId, entrada.ctx.mundo.id),
        eq(handoffs.checkpointFence, entrada.anfitriao.presenca.fence),
        eq(games.spaceId, entrada.ctx.mundo.id),
        eq(games.endReason, "replaced"),
        isNotNull(games.endedAt),
        isNotNull(visitSessions.admittedAt),
      ),
    );
  if (
    !prova?.sessao.checkpointFrozenAt ||
    !prova.troca.confirmedAt ||
    prova.sessao.checkpointFrozenAt.getTime() !== prova.troca.confirmedAt.getTime() ||
    (prova.anterior.state !== "active" &&
      !(prova.anterior.state === "closed" && prova.anterior.closeReason === "replaced"))
  )
    throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
  return prova.anterior;
}

export async function admitirEntradaDeVisitaNoBanco(
  host: Host,
  mundoId: MundoId,
  pedido: z.infer<typeof PedidoDeEntradaDeVisitaSchema>,
): Promise<EntradaDeVisitante> {
  const [pista] = await db
    .select({ sessao: games, versao: profiles.policyVersion })
    .from(games)
    .innerJoin(profiles, eq(profiles.id, games.profileId))
    .where(
      and(
        eq(games.id, pedido.sid),
        eq(games.profileId, pedido.perfilId),
        eq(games.gameId, host.jogo),
        isNull(games.endedAt),
      ),
    );
  if (!pista) throw new ErroDoRecreio("SESSAO_ENCERRADA");
  return comSessaoVisitanteAtual(
    {
      sid: pedido.sid,
      perfilId: pedido.perfilId,
      jogo: host.jogo,
      expiraEm: pista.sessao.expiresAt.getTime(),
      versaoDaPolitica: pista.versao,
    },
    pedido.visitaId,
    async (tx, entrada) => {
      const { ctx, anfitriao, visita, intencao, sessao, perfil } = entrada;
      if (
        ctx.mundo.id !== mundoId ||
        anfitriao.presenca.instanceId !== host.instanciaId ||
        anfitriao.presenca.fence !== pedido.cerca
      )
        throw new ErroDoRecreio("POSSE_PERDIDA");
      await conferirCapacidadeDeJogadores(tx, { mundoId, jogo: host.jogo, sid: sessao.id });
      const agora = await entrada.conferirPrazo();
      let anteriorId: string | null = null;
      if (intencao.state === "prepared") {
        const [historia] = await tx
          .select({ id: visitSessions.id })
          .from(visitSessions)
          .where(and(eq(visitSessions.visitId, visita.id), isNotNull(visitSessions.admittedAt)))
          .limit(1);
        if (historia) {
          const anterior = await antecessoraComCheckpoint(tx, entrada),
            [ativa] = await tx
              .select({ id: visitSessions.id })
              .from(visitSessions)
              .where(and(eq(visitSessions.visitId, visita.id), eq(visitSessions.state, "active")));
          if (ativa && ativa.id !== anterior.id) throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
          await tx
            .update(visitSessions)
            .set({ state: "closed", closedAt: agora, updatedAt: agora, closeReason: "replaced" })
            .where(eq(visitSessions.id, anterior.id));
          anteriorId = anterior.sessionId;
        }
      }
      const permissaoAte = new Date(
        Math.min(
          agora.getTime() + 30_000,
          anfitriao.presenca.expiresAt.getTime(),
          anfitriao.presenca.validUntil.getTime(),
          anfitriao.sessao.expiresAt.getTime(),
          anfitriao.posse.expiresAt.getTime(),
          sessao.expiresAt.getTime(),
          visita.expiresAt.getTime(),
        ),
      );
      const [vinculada] = await tx
        .update(games)
        .set({ spaceId: mundoId })
        .where(and(eq(games.id, sessao.id), isNull(games.endedAt)))
        .returning({ id: games.id });
      if (!vinculada) throw new ErroDoRecreio("SESSAO_ENCERRADA");
      await tx
        .update(visitSessions)
        .set({
          state: "active",
          admittedAt: intencao.admittedAt ?? agora,
          permissionUntil: permissaoAte,
          updatedAt: agora,
        })
        .where(eq(visitSessions.id, intencao.id));
      if (intencao.state === "prepared")
        await logAuditEventStrict(
          "recreio.visit_session_admitted",
          ctx.contaId,
          {
            app: "recreio",
            spaceId: mundoId,
            visitId: visita.id,
            sessionId: sessao.id,
            visitSessionId: intencao.id,
            profileId: perfil.id,
            previousSessionId: anteriorId,
          },
          { writer: tx },
        );
      if (permissaoAte <= (await entrada.conferirPrazo()))
        throw new ErroDoRecreio("SESSAO_ENCERRADA");
      const politica = politicaDaAdmissao(
        { politica: ctx.destino.politicaDeJogo, versaoDaPolitica: perfil.policyVersion },
        jogoDoCatalogo(host.jogo),
      );
      return {
        visitaId: visita.id,
        sessaoDeVisitaId: intencao.id,
        permissaoAte: permissaoAte.toISOString(),
        apelido: perfil.nickname,
        avatar: perfil.avatar,
        politica: {
          multiplayer: politica.multiplayer,
          textoLivre: politica.textoLivre,
          versao: politica.versao,
        },
      };
    },
  );
}
