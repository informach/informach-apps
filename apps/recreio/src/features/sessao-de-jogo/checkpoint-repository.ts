import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { ResultadoDeCheckpoint } from "@informach/recreio/contrato";
import { comSessaoDeJogoAutoritativa } from "@/features/autoridade-de-jogo/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { travar } from "@/lib/repository";
import type { SessaoDeJogoAtiva } from "./service";

export function confirmarCheckpointDePerfil(
  sessao: SessaoDeJogoAtiva,
  entrada: { id: string; confirmado: boolean },
): Promise<ResultadoDeCheckpoint> {
  return comSessaoDeJogoAutoritativa(
    sessao,
    (tx) => travar(tx, `recreio:game_sessions:perfil:${sessao.perfilId}`),
    async (tx, contaId, admissao): Promise<ResultadoDeCheckpoint> => {
      if (jogoDoCatalogo(sessao.jogo).capacidades.mundos) throw new ErroDoRecreio("SEM_PERMISSAO");
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
        pedido.mode !== "profile"
      )
        throw new ErroDoRecreio("SEM_PERMISSAO");
      const agora = await admissao.conferirPrazo();
      if (pedido.status === "confirmed") {
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
        await tx
          .update(handoffs)
          .set({ status: "expired", finishedAt: agora })
          .where(eq(handoffs.id, pedido.id));
        return { estado: "expired", pausada: atual.pausa !== null };
      }
      if (atual.pausa !== null) throw new ErroDoRecreio("SESSAO_INVALIDA");
      if (entrada.confirmado) {
        // UPDATE da sessão foi tomado antes: gravações admitidas terminaram, futuras serão recusadas.
        await tx.update(games).set({ checkpointFrozenAt: agora }).where(eq(games.id, sessao.sid));
        await tx
          .update(handoffs)
          .set({ status: "confirmed", confirmedAt: agora })
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
      return { estado: entrada.confirmado ? "confirmed" : "failed", pausada: entrada.confirmado };
    },
    { travaDaSessao: "update", permitirPausaDeCheckpoint: true },
  );
}
