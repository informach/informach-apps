import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { ResultadoDeCheckpoint } from "@informach/recreio/contrato";
import {
  type Admissao,
  comSessaoDeJogoAutoritativa,
} from "@/features/autoridade-de-jogo/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { type Transacao, travar } from "@/lib/repository";
import type { SessaoDeJogoAtiva } from "./service";

export function confirmarCheckpointDePerfil(
  sessao: SessaoDeJogoAtiva,
  entrada: { id: string; confirmado: boolean },
): Promise<ResultadoDeCheckpoint> {
  return confirmarCheckpointDoJogo(sessao, entrada, { modo: "profile", validar: async () => null });
}

export type ProvaDeCheckpointDeMundo = {
  mundoId: string;
  cerca: number;
  revisao: number;
  diarioSeq: number;
};

/** Composição servidor: a prova é construída por autoridade de posse, nunca pelo corpo do SDK. */
export function confirmarCheckpointDoJogo(
  sessao: SessaoDeJogoAtiva,
  entrada: { id: string; confirmado: boolean },
  autoridade: {
    modo: "profile" | "server";
    antesDoPerfil?: (tx: Transacao) => Promise<void>;
    validar: (
      tx: Transacao,
      pedido: typeof handoffs.$inferSelect,
      admissao: Admissao,
    ) => Promise<ProvaDeCheckpointDeMundo | null>;
    conferirFinal?: (tx: Transacao) => Promise<void>;
  },
): Promise<ResultadoDeCheckpoint> {
  return comSessaoDeJogoAutoritativa(
    sessao,
    (tx) => travar(tx, `recreio:game_sessions:perfil:${sessao.perfilId}`),
    async (tx, contaId, admissao): Promise<ResultadoDeCheckpoint> => {
      const capacidades = jogoDoCatalogo(sessao.jogo).capacidades;
      if (
        autoridade.modo === "profile"
          ? capacidades.mundos !== null || capacidades.checkpoint !== "perfil"
          : capacidades.mundos === null || capacidades.checkpoint !== "servidor"
      )
        throw new ErroDoRecreio("SEM_PERMISSAO");
      const [pedido] = await tx
        .select()
        .from(handoffs)
        .where(eq(handoffs.id, entrada.id))
        .for("update");
      const [atual] = await tx
        .select({ pausa: games.checkpointFrozenAt })
        .from(games)
        .where(eq(games.id, sessao.sid));
      if (
        !pedido ||
        !atual ||
        pedido.fromSessionId !== sessao.sid ||
        pedido.profileId !== sessao.perfilId ||
        pedido.policyVersion !== admissao.versaoDaPolitica ||
        pedido.mode !== autoridade.modo
      )
        throw new ErroDoRecreio("SEM_PERMISSAO");
      let agora = await admissao.conferirPrazo();
      const expirar = async (): Promise<ResultadoDeCheckpoint> => {
        await tx
          .update(handoffs)
          .set({ status: "expired", finishedAt: agora })
          .where(eq(handoffs.id, pedido.id));
        return { estado: "expired", pausada: atual.pausa !== null };
      };
      if (pedido.status === "confirmed") {
        await autoridade.validar(tx, pedido, admissao);
        await autoridade.conferirFinal?.(tx);
        agora = await admissao.conferirPrazo();
        if (
          !atual.pausa ||
          !pedido.confirmedAt ||
          atual.pausa.getTime() !== pedido.confirmedAt.getTime()
        )
          throw new ErroDoRecreio("SESSAO_INVALIDA");
        if (pedido.expiresAt > agora) return { estado: "confirmed", pausada: true };
      }
      if (pedido.status === "failed" || pedido.status === "expired")
        return { estado: pedido.status, pausada: atual.pausa !== null };
      if (pedido.status !== "requested" && pedido.status !== "confirmed")
        throw new ErroDoRecreio("SEM_PERMISSAO");
      if (pedido.expiresAt <= agora) {
        return expirar();
      }
      if (atual.pausa !== null) throw new ErroDoRecreio("SESSAO_INVALIDA");
      const prova = await autoridade.validar(tx, pedido, admissao);
      agora = await admissao.conferirPrazo();
      if (pedido.expiresAt <= agora) return expirar();
      if (entrada.confirmado && autoridade.modo === "server" && !prova)
        throw new ErroDoRecreio("SEM_PERMISSAO");
      if (entrada.confirmado) {
        // UPDATE da sessão foi tomado antes: gravações admitidas terminaram, futuras serão recusadas.
        await tx.update(games).set({ checkpointFrozenAt: agora }).where(eq(games.id, sessao.sid));
        await tx
          .update(handoffs)
          .set({
            status: "confirmed",
            confirmedAt: agora,
            ...(prova
              ? {
                  checkpointSpaceId: prova.mundoId,
                  checkpointFence: prova.cerca,
                  checkpointRevision: prova.revisao,
                  checkpointJournalSeq: prova.diarioSeq,
                }
              : {}),
          })
          .where(eq(handoffs.id, pedido.id));
      } else {
        await tx
          .update(handoffs)
          .set({ status: "failed", finishedAt: agora })
          .where(eq(handoffs.id, pedido.id));
      }
      await logAuditEventStrict(
        entrada.confirmado ? "recreio.session_handoff_confirmed" : "recreio.session_handoff_failed",
        contaId,
        {
          app: "recreio",
          profileId: sessao.perfilId,
          sessionId: sessao.sid,
          handoffId: pedido.id,
          targetId: contaId,
        },
        { writer: tx },
      );
      await autoridade.conferirFinal?.(tx);
      if (pedido.expiresAt <= (await admissao.conferirPrazo()))
        throw new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "expired" });
      return { estado: entrada.confirmado ? "confirmed" : "failed", pausada: entrada.confirmado };
    },
    {
      travaDaSessao: "update",
      permitirPausaDeCheckpoint: true,
      antesDoPerfil: autoridade.antesDoPerfil,
    },
  );
}
