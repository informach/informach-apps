import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "@informach/db";
import {
  recreioRightsRecoveryFinances as assessments,
  recreioRenewalCancellations as cancellations,
  recreioAccountClosureFinances as finances,
  type recreioRightsOperations as operations,
  recreioRightsRecoveryRuns as runs,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { conferirFinanceiroDosEfeitos } from "./encerramento-efeitos-repository";
import { lerOrigemFinanceiraDoEncerramentoLocked } from "./encerramento-origem-financeira-repository";
import type { PlanoDeDireitos } from "./preparacao-contrato";

const hash = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");
export const resumirConfirmacaoFinanceiraRecuperada = (linha: typeof finances.$inferSelect) =>
  hash(linha);
export const resumirOrigemFinanceiraRecuperada = (
  origem: string,
  renovacoes: readonly (typeof cancellations.$inferSelect)[],
) => hash({ origem, renovacoes });
export type SeloFinanceiroRecuperado = Readonly<{
  token: string;
  numero: number;
  reciboSha256: string;
}>;

/** Called with the original operation lock. This verifies current facts and
 * one run's fresh receipt; it cannot mint a private scope or a browser login.
 * The data factory must seal this result itself and recheck it at every TX.
 * A new attempt/review invalidates an older seal before provider I/O begins. */
export async function conferirFinanceiroAtualRecuperadoLocked(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  plano: PlanoDeDireitos,
  escopo: { execucaoId: string; cercaSha256: string },
  esperado?: SeloFinanceiroRecuperado,
) {
  assertAllowed(
    op.kind === "encerrar_conta" &&
      ((op.preparationId !== null && op.recoverySourceId === null) ||
        (op.preparationId === null &&
          op.recoverySourceId === op.id &&
          plano.perfis.length === 0 &&
          plano.mundos.length === 0)) &&
      plano.formato === "recreio-previa-encerramento-v2",
    "DIREITOS_INTEGRIDADE",
    "Encerramento financeiro histórico fora do perfil qualificado.",
  );
  const [run] = await tx
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.id, escopo.execucaoId),
        eq(runs.ledgerId, op.ledgerId),
        eq(runs.frozenHeadSha256, escopo.cercaSha256),
        eq(runs.state, "replaying"),
      ),
    );
  assertAllowed(run, "DIREITOS_INTEGRIDADE", "Avaliação financeira fora da execução privada.");
  await conferirFinanceiroDosEfeitos(tx, op, plano, true);
  const [financeiro] = await tx
    .select()
    .from(finances)
    .where(eq(finances.operationId, op.id))
    .for("share");
  assertAllowed(financeiro, "DIREITOS_INTEGRIDADE", "Confirmação financeira original ausente.");
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
  const [atual] = await tx
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.runId, run.id),
        eq(assessments.operationId, op.id),
        eq(assessments.ledgerId, op.ledgerId),
        eq(assessments.requesterReference, op.requesterUserId),
        eq(assessments.kind, "encerrar_conta"),
        eq(assessments.planSha256, op.planSha256),
        eq(assessments.providerMode, financeiro.providerMode),
        eq(assessments.state, "current"),
        eq(assessments.sourceSha256, resumirOrigemFinanceiraRecuperada(origem.sha256, renovacoes)),
        eq(
          assessments.historicalConfirmationSha256,
          resumirConfirmacaoFinanceiraRecuperada(financeiro),
        ),
        sql`${assessments.observedAt}<=${AGORA} and ${assessments.observedAt}>=${AGORA}-interval '5 minutes'`,
      ),
    )
    .for("share");
  assertAllowed(
    atual?.receiptSha256 &&
      atual.result === (origem.cliente ? "provider_inventory" : "no_customer") &&
      (!esperado ||
        (atual.attemptToken === esperado.token &&
          atual.attempts === esperado.numero &&
          atual.receiptSha256 === esperado.reciboSha256)),
    "DIREITOS_INTEGRIDADE",
    "Falta uma avaliação financeira atual para esta recuperação.",
  );
  return Object.freeze({
    token: atual.attemptToken,
    numero: atual.attempts,
    reciboSha256: atual.receiptSha256,
  });
}
