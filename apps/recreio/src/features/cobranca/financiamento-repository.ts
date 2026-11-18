import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray } from "@informach/db";
import {
  recreioFundingCaptures as captures,
  recreioBillingContracts as contracts,
  recreioPaymentFunding as current,
  recreioFundingObservations as observations,
  subscriptionPaymentPeriods as periods,
  recreioFundingSourcePeriods as sources,
} from "@informach/db/schema";
import { lerOrigemDaAssinaturaParaTroca } from "@/features/acesso/repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import { prepararPeriodosDoFinanciamento } from "./financiamento-periodos";
import {
  type ConferenciaFinanceiraDoCliente,
  conferirMarcaFinanceira,
} from "./financiamento-stripe";

function conferir(valor: unknown): asserts valor {
  assertAllowed(valor, "ORIGEM_FINANCEIRA", "A prova de origem financeira exige conferência.");
}
const chave = (fatura: string, linha: string) => JSON.stringify([fatura, linha]);

/** Caller holds the payer lifecycle and the admitted reconciliation transaction.
 * Core periods and native contracts must already exist in that SAME transaction.
 * This writer grants nothing and never changes historical payment flags/dates. */
export async function persistirFinanciamentoLocked(
  tx: Transacao,
  tentativa: TentativaDeConciliacao,
  conferencia: ConferenciaFinanceiraDoCliente,
  vinculos: readonly { subscriptionId: string; providerSubscriptionId: string }[],
) {
  conferirMarcaFinanceira(conferencia);
  conferir(
    tentativa.customer &&
      conferencia.clienteId === tentativa.customer.providerCustomerId &&
      conferencia.paganteId === tentativa.payerUserId &&
      conferencia.modo === tentativa.providerMode &&
      vinculos.length === conferencia.leituras.length &&
      new Set(vinculos.map((v) => v.subscriptionId)).size === vinculos.length &&
      new Set(vinculos.map((v) => v.providerSubscriptionId)).size === vinculos.length,
  );
  const projetados = prepararPeriodosDoFinanciamento(conferencia, tentativa.startedAt);
  const contratos = new Map<string, typeof contracts.$inferSelect>();
  for (const snapshot of projetados) {
    const vinculo = vinculos.find((v) => v.providerSubscriptionId === snapshot.subscriptionId);
    conferir(vinculo);
    const origem = await lerOrigemDaAssinaturaParaTroca(
      tx,
      vinculo.subscriptionId,
      tentativa.payerUserId,
    );
    conferir(
      origem &&
        origem.customerId === tentativa.customer.id &&
        origem.providerCustomerId === conferencia.clienteId &&
        origem.providerSubscriptionId === snapshot.subscriptionId,
    );
    const [contrato] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.subscriptionId, vinculo.subscriptionId))
      .for("update");
    conferir(
      contrato &&
        contrato.groupId === tentativa.groupId &&
        contrato.payerUserId === tentativa.payerUserId &&
        contrato.providerMode === tentativa.providerMode &&
        contrato.purchaseId === snapshot.origin?.authorizationId &&
        contrato.originProductId === snapshot.origin?.productId,
    );
    contratos.set(snapshot.subscriptionId, contrato);
  }
  const esperados = projetados.flatMap((s) =>
    s.periods.map((p) => ({ ...p, assinaturaId: s.subscriptionId })),
  );
  if (esperados.length === 0) return;
  const linhas = await tx
    .select()
    .from(periods)
    .where(
      and(
        eq(periods.provider, "stripe"),
        inArray(
          periods.subscriptionId,
          vinculos.map((v) => v.subscriptionId),
        ),
        inArray(
          periods.providerLineId,
          esperados.map((p) => p.lineId),
        ),
      ),
    )
    .for("update");
  conferir(linhas.length === esperados.length);
  const porLinha = new Map(linhas.map((p) => [chave(p.providerInvoiceId, p.providerLineId), p]));
  for (const p of esperados) {
    const salvo = porLinha.get(chave(p.invoiceId, p.lineId));
    conferir(
      salvo &&
        salvo.subscriptionId === contratos.get(p.assinaturaId)?.subscriptionId &&
        salvo.providerPriceId === p.priceId &&
        salvo.periodStart.getTime() === p.start.getTime() &&
        salvo.periodEnd.getTime() === p.end.getTime() &&
        salvo.paidAt.getTime() === p.paidAt.getTime() &&
        salvo.fullyRefunded === p.fullyRefunded &&
        salvo.disputed === p.disputed &&
        salvo.reconciledAt.getTime() === tentativa.startedAt.getTime(),
    );
  }
  const capturas = new Map(
    conferencia.leituras.flatMap((l) => l.funding.captures.map((c) => [c.id, c] as const)),
  );
  const origensPorCaptura = new Map(
    [...capturas.keys()].sort().map((id) => {
      const captura = capturas.get(id);
      conferir(captura);
      const periodosDeOrigem = conferencia.leituras.flatMap((l) =>
        l.funding.invoices
          .filter((f) => f.captures.some((c) => c.chargeId === id))
          .flatMap((f) =>
            f.lines
              .filter((p) => p.amountCents > 0)
              .map((p) => {
                const salvo = porLinha.get(chave(f.id, p.id)),
                  origem = contratos.get(l.snapshot.subscriptionId);
                conferir(salvo && origem);
                return {
                  periodId: salvo.id,
                  subscriptionId: origem.subscriptionId,
                  purchaseId: origem.purchaseId,
                  productId: origem.originProductId,
                };
              }),
          ),
      );
      conferir(periodosDeOrigem.length > 0);
      periodosDeOrigem.sort((a, b) => a.periodId.localeCompare(b.periodId));
      return [id, { captura, periodos: periodosDeOrigem }] as const;
    }),
  );

  let referencias = 0;
  for (const prova of conferencia.financiamento.periodos) {
    const periodo = porLinha.get(chave(prova.faturaId, prova.linhaId)),
      esperado = esperados.find(
        (p) => p.invoiceId === prova.faturaId && p.lineId === prova.linhaId,
      );
    conferir(periodo && esperado);
    const contrato = contratos.get(esperado.assinaturaId);
    conferir(contrato);
    const origens = [...prova.capturasDeOrigem].sort().map((id) => {
      const origem = origensPorCaptura.get(id);
      conferir(origem);
      referencias += origem.periodos.length;
      conferir(referencias <= 9600);
      return origem;
    });
    conferir(origens.length > 0);
    const estado =
      prova.estado === "comprovado"
        ? "verified"
        : prova.estado === "revogado"
          ? "revoked"
          : "review";
    const evidencia = {
      periodId: periodo.id,
      subscriptionId: contrato.subscriptionId,
      purchaseId: contrato.purchaseId,
      groupId: contrato.groupId,
      payerId: contrato.payerUserId,
      mode: contrato.providerMode,
      productId: contrato.originProductId,
      state: estado,
      fundedUntil: prova.cobertoAte,
      version: conferencia.financiamento.versao,
      origins: origens,
    };
    const hash = createHash("sha256").update(JSON.stringify(evidencia)).digest("hex");
    const [anterior] = await tx
      .select({ observadoEm: current.observedAt, hash: observations.evidenceHash })
      .from(current)
      .innerJoin(observations, eq(observations.id, current.observationId))
      .where(eq(current.paymentPeriodId, periodo.id))
      .for("update", { of: current });
    conferir(
      !anterior ||
        anterior.observadoEm < tentativa.startedAt ||
        (anterior.observadoEm.getTime() === tentativa.startedAt.getTime() &&
          anterior.hash === hash),
    );
    if (anterior?.observadoEm.getTime() === tentativa.startedAt.getTime()) continue;
    const [nova] = await tx
      .insert(observations)
      .values({
        paymentPeriodId: periodo.id,
        subscriptionId: contrato.subscriptionId,
        provider: "stripe",
        purchaseId: contrato.purchaseId,
        groupId: contrato.groupId,
        payerUserId: contrato.payerUserId,
        providerMode: contrato.providerMode,
        originProductId: contrato.originProductId,
        fundingStatus: estado,
        fundedUntil: new Date(prova.cobertoAte * 1000),
        policyVersion: conferencia.financiamento.versao,
        evidenceHash: hash,
        firstObservedAt: tentativa.startedAt,
      })
      .onConflictDoNothing({
        target: [
          observations.paymentPeriodId,
          observations.policyVersion,
          observations.evidenceHash,
        ],
      })
      .returning({ id: observations.id });
    let encontradaId = nova?.id;
    if (!encontradaId) {
      const [existente] = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(
          and(
            eq(observations.paymentPeriodId, periodo.id),
            eq(observations.policyVersion, conferencia.financiamento.versao),
            eq(observations.evidenceHash, hash),
          ),
        );
      conferir(existente);
      encontradaId = existente.id;
    }
    const observacaoId = encontradaId;
    if (nova) {
      await tx.insert(captures).values(
        origens.map(({ captura }) => ({
          observationId: observacaoId,
          providerChargeId: captura.id,
          amountCapturedCents: captura.amountCapturedCents,
          amountRefundedCents: captura.amountRefundedCents,
          disputed: captura.disputed,
        })),
      );
      const referenciasDaProva = origens.flatMap(({ captura, periodos: referencias }) =>
        referencias.map((p) => ({
          observationId: observacaoId,
          providerChargeId: captura.id,
          sourcePaymentPeriodId: p.periodId,
          sourceSubscriptionId: p.subscriptionId,
          sourcePurchaseId: p.purchaseId,
          sourceOriginProductId: p.productId,
          provider: "stripe" as const,
          groupId: contrato.groupId,
          payerUserId: contrato.payerUserId,
          providerMode: contrato.providerMode,
        })),
      );
      for (let inicio = 0; inicio < referenciasDaProva.length; inicio += 250)
        await tx.insert(sources).values(referenciasDaProva.slice(inicio, inicio + 250));
    }
    await tx
      .insert(current)
      .values({
        paymentPeriodId: periodo.id,
        observationId: observacaoId,
        observedAt: tentativa.startedAt,
      })
      .onConflictDoUpdate({
        target: current.paymentPeriodId,
        set: { observationId: observacaoId, observedAt: tentativa.startedAt },
      });
    if (!anterior || anterior.hash !== hash)
      await logAuditEventStrict(
        "recreio.payment_funding_observed",
        tentativa.payerUserId,
        {
          app: "recreio",
          groupId: tentativa.groupId,
          subscriptionId: contrato.subscriptionId,
          paymentPeriodId: periodo.id,
          observationId: observacaoId,
          state: estado,
        },
        { writer: tx },
      );
  }
}
