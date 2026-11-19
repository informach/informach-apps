import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioDeviceSessions as devices,
  recreioAccountClosureFinances as finances,
  recreioAccountParticipations as participations,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { exigirParticipacaoAtivaLocked } from "@/features/account/participacao-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { PlanoDeEncerramento } from "./preparacao-contrato";

/** Caller holds the financial lifecycle and sorted native identities UPDATE,
 * before worlds/profiles/devices; the signed operation already exists in this
 * same TX. Only closes known never-sent requests. No provider I/O or conclusion. */
export async function congelarContaDoEncerramentoLocked(
  tx: Transacao,
  plano: PlanoDeEncerramento,
  operacaoId: string,
  agora: Date,
) {
  const atual = await exigirParticipacaoAtivaLocked(tx, plano.contaId);
  assertAllowed(
    atual.revisao === plano.revisaoDaParticipacao,
    "ESCOPO",
    "A participação mudou. Prepare uma nova prévia.",
  );
  const compras = plano.financeiro.comprasNaoEnviadas.length
    ? await tx
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.payerUserId, plano.contaId),
            inArray(purchases.id, plano.financeiro.comprasNaoEnviadas),
          ),
        )
        .orderBy(purchases.id)
        .for("update")
    : [];
  const trocas = plano.financeiro.trocasNaoEnviadas.length
    ? await tx
        .select()
        .from(changes)
        .where(
          and(
            eq(changes.payerUserId, plano.contaId),
            inArray(changes.id, plano.financeiro.trocasNaoEnviadas),
          ),
        )
        .orderBy(changes.id)
        .for("update")
    : [];
  assertAllowed(
    compras.length === plano.financeiro.comprasNaoEnviadas.length &&
      trocas.length === plano.financeiro.trocasNaoEnviadas.length &&
      compras.every(
        (p) =>
          p.providerMode === plano.financeiro.modo &&
          p.resolvedAt === null &&
          p.requestStartedAt === null &&
          p.providerSessionId === null &&
          p.providerSubscriptionId === null &&
          !p.reviewRequired,
      ) &&
      trocas.every(
        (p) =>
          p.providerMode === plano.financeiro.modo &&
          p.resolvedAt === null &&
          p.requestStartedAt === null &&
          p.providerScheduleId === null &&
          p.providerInvoiceId === null &&
          !p.reviewRequired &&
          (p.status === "quoted" || p.status === "accepted"),
      ),
    "COBRANCA_EM_CONFERENCIA",
    "Os pedidos financeiros mudaram. Confira-os antes de encerrar.",
  );
  for (const compra of compras) {
    await tx
      .update(purchases)
      .set({ resolvedAt: agora, resolution: "not_started" })
      .where(eq(purchases.id, compra.id));
    await logAuditEventStrict(
      "recreio.purchase_authorization_closed",
      plano.contaId,
      {
        app: "recreio",
        groupId: compra.groupId,
        authorizationId: compra.id,
        resolution: "not_started",
      },
      { writer: tx },
    );
  }
  for (const troca of trocas) {
    await tx
      .update(changes)
      .set({ status: "canceled", resolvedAt: agora, reviewRequired: false })
      .where(eq(changes.id, troca.id));
    await logAuditEventStrict(
      "recreio.plan_change_closed",
      plano.contaId,
      {
        app: "recreio",
        groupId: troca.groupId,
        planChangeId: troca.id,
        state: "canceled_before_attempt",
      },
      { writer: tx },
    );
  }
  const cliente = plano.financeiro.clientes[0];
  await tx.insert(finances).values({
    operationId: operacaoId,
    requesterUserId: plano.contaId,
    providerMode: plano.financeiro.modo,
    customerId: cliente?.id ?? null,
    providerCustomerId: cliente?.referenciaStripe ?? null,
    policyVersion: "encerramento-financeiro-2026-11-19-v1",
    state: "pending",
    attempts: 0,
    createdAt: agora,
    updatedAt: agora,
    nextAttemptAt: agora,
  });
  const [iniciada] = await tx
    .insert(participations)
    .values({
      userId: plano.contaId,
      state: "closing",
      revision: 2,
      operationId: operacaoId,
      closingAt: agora,
      closedAt: null,
      updatedAt: agora,
    })
    .onConflictDoUpdate({
      target: participations.userId,
      set: {
        state: "closing",
        revision: 2,
        operationId: operacaoId,
        closingAt: agora,
        closedAt: null,
        updatedAt: agora,
      },
      setWhere: and(
        eq(participations.state, "active"),
        eq(participations.revision, plano.revisaoDaParticipacao),
      ),
    })
    .returning({ id: participations.userId });
  assertAllowed(iniciada, "CONFLITO", "A participação mudou. Prepare uma nova prévia.");
  // Preserve native identity for rights/billing. Never clear a child's restricted
  // context or manufacture an unrestricted adult session while removing play.
  await tx
    .update(devices)
    .set({ activeProfileId: null })
    .where(and(eq(devices.kind, "account"), eq(devices.userId, plano.contaId)));
  await logAuditEventStrict(
    "recreio.account_participation_closing",
    plano.contaId,
    { app: "recreio", operationId: operacaoId, state: "closing", revision: 2 },
    { writer: tx },
  );
}
