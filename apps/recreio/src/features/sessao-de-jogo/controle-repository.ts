import "server-only";
import { and, eq, gt, inArray } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { ControleDaSessao } from "@informach/recreio/contrato";
import { comSessaoDeJogoAutoritativa } from "@/features/autoridade-de-jogo/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { consultarTempoDeJogo } from "@/features/politicas/controle-repository";
import type { SessaoDeJogoAtiva } from "./service";

/** A leitura admite sessão/aparelho atuais; o contato de controle não estende a concessão. */
export function lerControleDaSessao(sessao: SessaoDeJogoAtiva): Promise<ControleDaSessao> {
  return comSessaoDeJogoAutoritativa(
    sessao,
    async () => {},
    async (tx, _conta, admissao) => {
      const agora = await admissao.conferirPrazo();
      const [atual] = await tx.select().from(games).where(eq(games.id, sessao.sid));
      if (!atual) throw new ErroDoRecreio("SESSAO_INVALIDA");
      const [pedido] = await tx
        .select({
          id: handoffs.id,
          status: handoffs.status,
          modo: handoffs.mode,
          expiraEm: handoffs.expiresAt,
        })
        .from(handoffs)
        .where(
          and(
            eq(handoffs.fromSessionId, sessao.sid),
            eq(handoffs.profileId, sessao.perfilId),
            eq(handoffs.policyVersion, admissao.versaoDaPolitica),
            inArray(handoffs.status, ["requested", "confirmed"]),
            gt(handoffs.expiresAt, agora),
          ),
        )
        .limit(1);
      const tempo = admissao.politica
        ? await consultarTempoDeJogo(
            tx,
            sessao.perfilId,
            sessao.sid,
            admissao.politica.configuracao,
            agora,
            atual.checkpointFrozenAt,
          )
        : null;
      const pausada = atual.checkpointFrozenAt !== null;
      if (
        pedido &&
        ((pedido.status === "confirmed") !== pausada ||
          pedido.modo !== (jogoDoCatalogo(sessao.jogo).capacidades.mundos ? "server" : "profile"))
      )
        throw new ErroDoRecreio("SESSAO_INVALIDA");
      await tx.update(games).set({ controlSeenAt: agora }).where(eq(games.id, sessao.sid));
      return {
        agora: agora.toISOString(),
        expiraEm: new Date(Math.min(atual.expiresAt.getTime(), sessao.expiraEm)).toISOString(),
        pausada,
        tempo,
        checkpoint:
          pedido && (pedido.status === "requested" || pedido.status === "confirmed")
            ? {
                id: pedido.id,
                estado: pedido.status,
                modo: pedido.modo,
                expiraEm: pedido.expiraEm.toISOString(),
              }
            : null,
      };
    },
    { travaDaSessao: "update", permitirPausaDeCheckpoint: true },
  );
}
