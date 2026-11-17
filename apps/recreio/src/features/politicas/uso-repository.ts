import "server-only";
import { and, desc, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { acertarUsoDeConcessao, ErroDoRecreio, type PerfilId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";
import { calendarioDeBrasilia } from "./tempo-repository";

/** Somente depois de admitir o responsável atual, sob a trava do perfil. */
export async function lerUsoRecente(tx: Transacao, perfilId: PerfilId, agora: Date) {
  const calendario = await calendarioDeBrasilia(tx, agora);
  const dias = await tx
    .select({
      dia: usage.localDay,
      usadoMs: usage.usedMilliseconds,
      salvarMs: usage.savingMilliseconds,
      contabilizadoAte: usage.accountedUntil,
      concedidoAte: usage.leaseUntil,
      sessaoId: games.id,
      encerradaEm: games.endedAt,
      congeladaEm: games.checkpointFrozenAt,
    })
    .from(usage)
    .leftJoin(games, and(eq(games.id, usage.sessionId), eq(games.profileId, usage.profileId)))
    .where(
      and(
        eq(usage.profileId, perfilId),
        sql`${usage.localDay} between ${calendario.dia}::date-6 and ${calendario.dia}::date`,
      ),
    )
    .orderBy(desc(usage.localDay))
    .limit(7);
  return dias.map((dia) => {
    let jogandoMs = dia.usadoMs;
    if (dia.concedidoAte) {
      if (!dia.sessaoId) throw new ErroDoRecreio("INDISPONIVEL");
      const fim = Math.min(
        dia.encerradaEm?.getTime() ?? Infinity,
        dia.congeladaEm?.getTime() ?? Infinity,
      );
      jogandoMs = acertarUsoDeConcessao(
        {
          usadoMs: dia.usadoMs,
          contabilizadoAte: dia.contabilizadoAte.getTime(),
          concedidoAte: dia.concedidoAte.getTime(),
        },
        agora.getTime(),
        Number.isFinite(fim) ? fim : null,
      ).usadoMs;
    }
    return { dia: dia.dia, jogandoMs, salvandoMs: dia.salvarMs };
  });
}
