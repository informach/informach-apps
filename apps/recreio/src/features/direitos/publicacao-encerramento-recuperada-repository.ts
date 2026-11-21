import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, sql } from "@informach/db";
import {
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioRightsRecoveryRuns as runs,
} from "@informach/db/schema";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import {
  type CoordenacaoDeEfeitos,
  conferirAdmissaoPersistidaDaCoordenacao,
  conferirPublicacaoPendenteDaCoordenacao,
  dadosDaCoordenacaoPrivada,
  reconferirCoordenacaoDeDireitos,
} from "./coordenacao-repository";

/** Confirms only an original native publication already authenticated in the
 * frozen external prefix. It does not mark the evaluation ready, confirm
 * finance or mint a data child. Original consent/financial rows are immutable. */
export async function confirmarPublicacaoDeEncerramentoRecuperada(
  config: CoordenacaoDeEfeitos,
  entrada: string,
) {
  const operacaoId = z.uuid().parse(entrada),
    privado = dadosDaCoordenacaoPrivada(config);
  const resultado = await privado.banco.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [run] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.id, privado.execucaoId), eq(runs.ledgerId, config.assinatura.livroId)))
      .for("share");
    assertAllowed(
      run?.state === "replaying" && run.frozenHeadSha256 === privado.cerca,
      "DIREITOS_INTEGRIDADE",
      "A execução histórica mudou.",
    );
    const [op] = await tx
      .select()
      .from(operations)
      .where(eq(operations.id, operacaoId))
      .for("update");
    assertAllowed(
      op &&
        op.kind === "encerrar_conta" &&
        op.preparationId !== null &&
        op.recoverySourceId === null &&
        config.prova.referencias.some(
          (r) =>
            r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
        ),
      "DIREITOS_INTEGRIDADE",
      "Publicação nativa de encerramento ausente.",
    );
    const lida =
      op.state === "publishing"
        ? await conferirPublicacaoPendenteDaCoordenacao(tx, config, op)
        : await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
    assertAllowed(
      lida.plano.formato === "recreio-previa-encerramento-v2",
      "DIREITOS_INTEGRIDADE",
      "O encerramento exige seu plano financeiro original.",
    );
    const [financeiro] = await tx
      .select()
      .from(finances)
      .where(and(eq(finances.operationId, op.id), eq(finances.requesterUserId, op.requesterUserId)))
      .for("share");
    const [participacao] = await tx
      .select()
      .from(participations)
      .where(
        and(eq(participations.userId, op.requesterUserId), eq(participations.operationId, op.id)),
      )
      .for("share");
    const cliente = lida.plano.financeiro.clientes[0];
    assertAllowed(
      financeiro &&
        financeiro.providerMode === lida.plano.financeiro.modo &&
        financeiro.customerId === (cliente?.id ?? null) &&
        financeiro.providerCustomerId === (cliente?.referenciaStripe ?? null) &&
        financeiro.policyVersion === "encerramento-financeiro-2026-11-19-v1" &&
        financeiro.createdAt.getTime() === op.consentedAt.getTime() &&
        participacao &&
        ((participacao.state === "closing" && participacao.revision === 2) ||
          (op.state === "completed" &&
            participacao.state === "closed" &&
            participacao.revision === 3)),
      "DIREITOS_INTEGRIDADE",
      "A publicação perdeu sua barreira ou preparação financeira original.",
    );
    if (op.state !== "publishing")
      return { operacaoId, jaConfirmada: true, dadosAdmitidos: false as const };
    const [admitida] = await tx
      .update(operations)
      .set({
        state: "admitted",
        admittedHeadSha256: privado.cerca,
        admittedAt: AGORA,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: AGORA,
        updatedAt: AGORA,
      })
      .where(and(eq(operations.id, op.id), eq(operations.state, "publishing")))
      .returning();
    assertAllowed(admitida, "DIREITOS_INTEGRIDADE", "Confirmação histórica indisponível.");
    await conferirAdmissaoPersistidaDaCoordenacao(tx, config, admitida);
    await logAuditEventStrict(
      "recreio.rights_admitted",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, kind: op.kind },
      { writer: tx },
    );
    dadosDaCoordenacaoPrivada(config);
    return { operacaoId, jaConfirmada: false, dadosAdmitidos: false as const };
  });
  await reconferirCoordenacaoDeDireitos(config, privado.storage);
  return resultado;
}
