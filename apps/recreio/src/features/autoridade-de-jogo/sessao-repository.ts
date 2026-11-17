import "server-only";
import { and, eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import { calendarioDeBrasilia } from "@/features/politicas/tempo-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import type { Transacao } from "@/lib/repository";
import { recusarAutoridade } from "./aparelho-repository";
import type { Admissao } from "./repository";

/** A admissão de perfil/aparelho já foi tomada, na mesma transação. */
export async function conferirSessaoAdmitida(
  tx: Transacao,
  sessao: Pick<SessaoDeJogoAtiva, "sid" | "perfilId" | "jogo" | "versaoDaPolitica">,
  admissao: Admissao,
  opcoes: { trava?: "share" | "update"; permitirPausaDeCheckpoint?: boolean } = {},
) {
  const [jogo] = await tx
    .select()
    .from(games)
    .where(eq(games.id, sessao.sid))
    .for(opcoes.trava ?? "share");
  const agora = await admissao.conferirPrazo();
  if (
    !jogo ||
    jogo.profileId !== sessao.perfilId ||
    jogo.deviceSessionId !== admissao.aparelho.id ||
    jogo.gameId !== sessao.jogo ||
    jogo.endedAt !== null ||
    jogo.expiresAt <= agora ||
    admissao.versaoDaPolitica !== sessao.versaoDaPolitica
  )
    return recusarAutoridade();
  if (jogo.checkpointFrozenAt !== null && !opcoes.permitirPausaDeCheckpoint)
    return recusarAutoridade(new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "checkpoint" }));
  if (admissao.politica) {
    const calendario = await calendarioDeBrasilia(tx, agora);
    const [concessao] = await tx
      .select({ fim: usage.leaseUntil })
      .from(usage)
      .where(
        and(
          eq(usage.profileId, sessao.perfilId),
          eq(usage.localDay, calendario.dia),
          eq(usage.sessionId, jogo.id),
        ),
      );
    if (!concessao?.fim || concessao.fim <= agora || jogo.expiresAt > concessao.fim)
      return recusarAutoridade();
  }
  return { admitida: true as const, jogo };
}
