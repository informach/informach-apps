import "server-only";
import { eq, sql } from "@informach/db";
import { recreioAccountParticipations as participations } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Caller conserva SHARE (ou mais forte) na identidade, antes de perfis e
 * aparelhos. O coordenador de encerramento precisa de UPDATE nessa mesma
 * identidade antes de mudar a participação; ausência não cria linha implícita. */
export async function lerParticipacaoDoRecreioLocked(
  tx: Transacao,
  contaId: string,
  exigirLeituraAtual = false,
) {
  if (exigirLeituraAtual) {
    const [configuracao] = await tx.execute<{ isolamento: string }>(
      sql`select current_setting('transaction_isolation') as isolamento`,
    );
    // Snapshot anterior à espera não comprova que a participação ainda está
    // ativa. Cópias consistentes usam autoridade de direitos, sem conceder escrita.
    assertAllowed(
      configuracao?.isolamento === "read committed",
      "PARTICIPACAO_EM_CONFERENCIA",
      "Não foi possível conferir a participação atual. Tente novamente.",
    );
  }
  const [atual] = await tx
    .select()
    .from(participations)
    .where(eq(participations.userId, contaId))
    .for("share");
  return atual
    ? {
        estado: atual.state,
        revisao: atual.revision,
        operacaoId: atual.operationId,
        iniciadaEm: atual.closingAt,
        encerradaEm: atual.closedAt,
      }
    : {
        estado: "active" as const,
        revisao: 0,
        operacaoId: null,
        iniciadaEm: null,
        encerradaEm: null,
      };
}

export async function exigirParticipacaoAtivaLocked(tx: Transacao, contaId: string) {
  const atual = await lerParticipacaoDoRecreioLocked(tx, contaId, true);
  assertAllowed(
    atual.estado === "active",
    "PARTICIPACAO_ENCERRADA",
    "Sua participação no Recreio está em encerramento ou já foi encerrada. Acesse seus dados e sua assinatura na conta.",
  );
  return atual;
}
