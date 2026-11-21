import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { conferirNascimentoFinanceiroDoEncerramento } from "./encerramento-financeiro-nascimento-repository";
import type { PlanoDeDireitos } from "./preparacao-contrato";

/** Queue predicate only. The selected operation must still pass the signed
 * plan check and the locked financial/participation check before any effect. */
export function escopoFinanceiroDosEfeitos(permitirConcluida = false) {
  const barreira = permitirConcluida
    ? sql`((p.state='closing' and p.revision=2) or (p.state='closed' and p.revision=3))`
    : sql`p.state='closing' and p.revision=2`;
  return sql`(${operations.kind}='retirar_perfil' or (${operations.kind}='encerrar_conta' and
    exists(select 1 from recreio.account_closure_finances f
      join recreio.account_participations p on p.user_id=f.requester_user_id and p.operation_id=f.operation_id
      where f.operation_id=${operations.id} and f.requester_user_id=${operations.requesterUserId}
        and f.state='confirmed' and ${barreira})))`;
}

/** Durable original reduction consent, never an operator login. Global auth
 * and financial records remain outside profile erasure. The parent operation
 * lock is held by every caller before acquiring these shared locks. */
export async function conferirFinanceiroDosEfeitos(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  plano: PlanoDeDireitos,
  permitirConcluida = false,
) {
  if (op.kind === "retirar_perfil") return;
  assertAllowed(
    plano.formato === "recreio-previa-encerramento-v2",
    "DIREITOS_INTEGRIDADE",
    "O encerramento exige seu escopo financeiro original.",
  );
  const [linha] = await tx
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
  const cliente = plano.financeiro.clientes[0];
  assertAllowed(linha, "DIREITOS_INTEGRIDADE", "A preparação financeira exige revisão.");
  await conferirNascimentoFinanceiroDoEncerramento(tx, op, linha);
  assertAllowed(
    linha?.state === "confirmed" &&
      linha.policyVersion === "encerramento-financeiro-2026-11-19-v1" &&
      linha.providerMode === plano.financeiro.modo &&
      linha.customerId === (cliente?.id ?? null) &&
      linha.providerCustomerId === (cliente?.referenciaStripe ?? null) &&
      linha.observationSha256 !== null &&
      linha.observedAt !== null &&
      linha.confirmedAt !== null &&
      linha.result === (cliente ? "provider_inventory" : "no_customer") &&
      participacao &&
      ((participacao.state === "closing" && participacao.revision === 2) ||
        (permitirConcluida && participacao.state === "closed" && participacao.revision === 3)),
    "DIREITOS_INTEGRIDADE",
    "A confirmação financeira e a barreira do encerramento exigem revisão.",
  );
}
