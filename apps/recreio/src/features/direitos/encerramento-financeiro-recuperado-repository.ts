import "server-only";
import { and, eq, inArray, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import {
  type CoordenacaoDeEfeitos,
  conferirIntencaoFinanceiraDaCoordenacao,
  dadosFinanceirosDaCoordenacaoPrivada,
} from "./coordenacao-repository";
import { conferirFinanceiroDosEfeitos } from "./encerramento-efeitos-repository";
import { lerOrigemFinanceiraDoEncerramentoLocked } from "./encerramento-origem-financeira-repository";

/** Fresh local assessment of a historically confirmed closure. No historical
 * financial row, consent, identity, evaluation or operation is updated here.
 * Both reads around provider I/O use this same owned private connection. */
export function lerFinanceiroConfirmadoRecuperado(config: CoordenacaoDeEfeitos) {
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  return privado.banco.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [op] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.id, privado.operacaoId),
          eq(operations.requesterUserId, privado.contaId),
          eq(operations.kind, "encerrar_conta"),
          inArray(operations.state, ["admitted", "running", "completed"]),
        ),
      )
      .for("share");
    assertAllowed(op, "DIREITOS_INTEGRIDADE", "Encerramento fora da avaliação financeira privada.");
    const { plano } = await conferirIntencaoFinanceiraDaCoordenacao(tx, op, config);
    assertAllowed(
      plano.formato === "recreio-previa-encerramento-v2",
      "DIREITOS_INTEGRIDADE",
      "Plano financeiro original ausente.",
    );
    await conferirFinanceiroDosEfeitos(tx, op, plano, true);
    const [financeiro] = await tx
      .select()
      .from(finances)
      .where(eq(finances.operationId, op.id))
      .for("share");
    const [participacao] = await tx
      .select()
      .from(participations)
      .where(
        and(eq(participations.userId, op.requesterUserId), eq(participations.operationId, op.id)),
      )
      .for("share");
    assertAllowed(
      financeiro && participacao,
      "DIREITOS_INTEGRIDADE",
      "Recibos financeiros históricos ausentes.",
    );
    assertAllowed(
      op.state === "completed"
        ? participacao.state === "closed" && participacao.revision === 3
        : participacao.state === "closing" && participacao.revision === 2,
      "DIREITOS_INTEGRIDADE",
      "Participação histórica fora da fase de encerramento.",
    );
    const origem = await lerOrigemFinanceiraDoEncerramentoLocked(tx, plano);
    const ids = origem.assinaturas.map((s) => s.contrato.subscriptionId);
    const renovacoes = ids.length
      ? await tx
          .select()
          .from(cancellations)
          .where(
            and(
              eq(cancellations.payerUserId, op.requesterUserId),
              eq(cancellations.providerMode, financeiro.providerMode),
              inArray(cancellations.subscriptionId, ids),
            ),
          )
          .orderBy(cancellations.subscriptionId)
          .for("share")
      : [];
    dadosFinanceirosDaCoordenacaoPrivada(config);
    return { op, financeiro, participacao, origem, renovacoes };
  });
}
