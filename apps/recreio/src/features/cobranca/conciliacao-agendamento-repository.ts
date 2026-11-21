import "server-only";
import type { StripeMode } from "@informach/config";
import { eq } from "@informach/db";
import { recreioBillingReconciliations as jobs } from "@informach/db/schema";
import { AGORA, type Transacao } from "@/lib/repository";

/** Pure transactional outbox scheduling. The caller already holds the payer
 * lifecycle and has admitted the exact payer/group; no global pool or login
 * composition is needed by a scoped private financial worker. */
export async function agendarConciliacaoDaCompra(
  tx: Transacao,
  entrada: { paganteId: string; grupoId: string; modo: StripeMode },
) {
  await tx
    .insert(jobs)
    .values({
      payerUserId: entrada.paganteId,
      groupId: entrada.grupoId,
      providerMode: entrada.modo,
    })
    .onConflictDoUpdate({
      target: [jobs.payerUserId, jobs.providerMode],
      set: { nextAttemptAt: AGORA, updatedAt: AGORA },
      setWhere: eq(jobs.groupId, entrada.grupoId),
    });
}
