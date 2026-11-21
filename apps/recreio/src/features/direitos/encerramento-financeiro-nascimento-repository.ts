import "server-only";
import { sql } from "@informach/db";
import type {
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { PlanoDeDireitos } from "./preparacao-contrato";

/** One qualified provenance policy for financial/data factories and guards. */
export function origemDeEncerramentoPrivadoPermitida(
  op: typeof operations.$inferSelect,
  plano: PlanoDeDireitos,
) {
  return (
    plano.formato === "recreio-previa-encerramento-v2" &&
    ((op.preparationId !== null && op.recoverySourceId === null) ||
      (op.preparationId === null &&
        op.recoverySourceId === op.id &&
        plano.financeiro.comprasNaoEnviadas.length === 0 &&
        plano.financeiro.trocasNaoEnviadas.length === 0))
  );
}

/** Native financial preparation shares the actual consent timestamp. A lost
 * operation may instead receive a NEW pending row on recovery: that birth is
 * tied to the authenticated historical source, never backdated to consent. */
export async function conferirNascimentoFinanceiroDoEncerramento(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  financeiro: typeof finances.$inferSelect,
) {
  if (op.preparationId !== null && op.recoverySourceId === null) {
    assertAllowed(
      financeiro.createdAt.getTime() === op.consentedAt.getTime(),
      "DIREITOS_INTEGRIDADE",
      "A preparação financeira nativa mudou.",
    );
    return;
  }
  assertAllowed(
    op.preparationId === null && op.recoverySourceId === op.id,
    "DIREITOS_INTEGRIDADE",
    "A origem financeira exige revisão.",
  );
  const [origem] = await tx.execute<{ valida: boolean }>(sql`select
    f.created_at>=s.imported_at and f.created_at>=r.created_at and f.created_at<=statement_timestamp() as valida
    from recreio.account_closure_finances f join recreio.rights_recovery_sources s on s.operation_id=f.operation_id
    join recreio.rights_recovery_runs r on r.id=s.run_id and r.ledger_id=s.ledger_id
    where f.operation_id=${op.id}::uuid and f.requester_user_id=${op.requesterUserId} and s.requester_reference=f.requester_user_id
    and s.ledger_id=${op.ledgerId}::uuid and s.kind='encerrar_conta' and s.plan_sha256=${op.planSha256}`);
  assertAllowed(
    origem?.valida,
    "DIREITOS_INTEGRIDADE",
    "A preparação financeira recuperada não tem origem conferida.",
  );
}
