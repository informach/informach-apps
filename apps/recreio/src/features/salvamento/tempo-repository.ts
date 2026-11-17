import "server-only";
import { and, eq, sql } from "@informach/db";
import { recreioMinorDailyUsage as usage } from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId, type SessaoDeJogoId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Chamador conserva perfil/recibo; executar só na primeira conclusão, na mesma TX. */
export async function registrarMargemDeSalvamento(
  tx: Transacao,
  entrada: {
    perfilId: PerfilId;
    sid: SessaoDeJogoId;
    corteEm: Date;
    concluidaEm: Date;
  },
) {
  const duracao = Math.max(0, entrada.concluidaEm.getTime() - entrada.corteEm.getTime());
  if (!Number.isSafeInteger(duracao) || duracao > 30_000) throw new ErroDoRecreio("INDISPONIVEL");
  const linhas = await tx
    .update(usage)
    .set({
      savingMilliseconds: sql`${usage.savingMilliseconds}+${duracao}`,
      updatedAt: entrada.concluidaEm,
    })
    .where(and(eq(usage.profileId, entrada.perfilId), eq(usage.sessionId, entrada.sid)))
    .returning({ dia: usage.localDay });
  if (linhas.length !== 1) throw new ErroDoRecreio("INDISPONIVEL");
}
