import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { readRecreioOwnedSubscription } from "@informach/billing/recreio-account-closure";
import type { StripeMode } from "@informach/config";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import { z } from "zod";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { comCicloDeCobranca } from "./lifecycle";
import {
  type AceiteDoCancelamentoDaRenovacao,
  VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
} from "./renovacao-contrato";

type Linha = typeof cancellations.$inferSelect;
export function reciboDoCancelamentoDaRenovacao(linha: Linha) {
  return {
    pedidoId: linha.id,
    assinaturaId: linha.subscriptionId,
    estado: linha.state,
    aceitoEm: linha.acceptedAt.toISOString(),
    tentativaEm: linha.requestStartedAt?.toISOString() ?? null,
    confirmadoEm: linha.confirmedAt?.toISOString() ?? null,
    fimDoPeriodoApresentado: linha.expectedPeriodEnd.toISOString(),
    resultado: linha.providerResult,
    renovacaoInterrompidaEm: linha.providerStopAt?.toISOString() ?? null,
  };
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}

/** Só aceite durável e encerramento de propostas comprovadamente não enviadas.
 * Mesmo sem vendas/jogador, a gestão financeira exige conta própria irrestrita.
 * O retorno accepted não afirma envio ou confirmação no Stripe. */
export function aceitarCancelamentoDaRenovacaoNoBanco(
  autor: AutorNativoRecente,
  pedido: AceiteDoCancelamentoDaRenovacao,
  config: { modo: StripeMode; fonte: string },
) {
  const fonte = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(config.fonte);
  return comCicloDeCobranca(autor.contaId, () =>
    db.transaction(async (tx) => {
      await limites(tx);
      const [pista] = await tx
        .select({ groupId: contracts.groupId })
        .from(contracts)
        .where(
          and(
            eq(contracts.subscriptionId, pedido.assinaturaId),
            eq(contracts.payerUserId, autor.contaId),
            eq(contracts.providerMode, config.modo),
          ),
        );
      assertAllowed(pista, "COBRANCA", "Assinatura não disponível.");
      const grupoId = GrupoIdSchema.parse(pista.groupId);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update", "financeiro");
      await atual.nativa.conferirPrazo(autor.login);
      const [contrato] = await tx
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.subscriptionId, pedido.assinaturaId),
            eq(contracts.groupId, grupoId),
            eq(contracts.payerUserId, autor.contaId),
            eq(contracts.providerMode, config.modo),
          ),
        )
        .for("update");
      assertAllowed(contrato, "COBRANCA", "Assinatura não disponível.");
      const [porId] = await tx
        .select()
        .from(cancellations)
        .where(
          and(
            eq(cancellations.id, pedido.pedidoId),
            eq(cancellations.payerUserId, autor.contaId),
            eq(cancellations.providerMode, config.modo),
          ),
        )
        .for("update");
      if (porId) {
        assertAllowed(
          porId.payerUserId === autor.contaId &&
            porId.subscriptionId === pedido.assinaturaId &&
            porId.providerMode === config.modo &&
            porId.expectedContractRevision === pedido.revisaoDoContrato &&
            porId.policyVersion === pedido.versaoDasCondicoes,
          "CONFLITO",
          "Confira o pedido de cancelamento já registrado.",
        );
        await atual.nativa.conferirPrazo(autor.login);
        return reciboDoCancelamentoDaRenovacao(porId);
      }
      const [anterior] = await tx
        .select()
        .from(cancellations)
        .where(
          and(
            eq(cancellations.subscriptionId, contrato.subscriptionId),
            eq(cancellations.payerUserId, autor.contaId),
            eq(cancellations.providerMode, config.modo),
          ),
        )
        .for("update");
      if (anterior) {
        assertAllowed(
          anterior.payerUserId === autor.contaId && anterior.providerMode === config.modo,
          "COBRANCA",
          "Pedido não disponível.",
        );
        await atual.nativa.conferirPrazo(autor.login);
        return reciboDoCancelamentoDaRenovacao(anterior);
      }
      assertAllowed(
        contrato.revision === pedido.revisaoDoContrato &&
          pedido.versaoDasCondicoes === VERSAO_DO_CANCELAMENTO_DA_RENOVACAO &&
          pedido.confirmoCancelamentoDaRenovacao,
        "CONFLITO",
        "O contrato mudou. Confira a situação atual antes de cancelar a renovação.",
      );
      const origem = await readRecreioOwnedSubscription(tx, autor.contaId, contrato.subscriptionId);
      assertAllowed(
        origem &&
          origem.productId === contrato.currentProductId &&
          origem.priceId === contrato.currentPriceId,
        "COBRANCA_EM_CONFERENCIA",
        "A origem da assinatura exige conferência antes do cancelamento.",
      );
      const pendentes = await tx
        .select()
        .from(changes)
        .where(
          and(
            eq(changes.subscriptionId, contrato.subscriptionId),
            eq(changes.payerUserId, autor.contaId),
            eq(changes.groupId, grupoId),
            eq(changes.providerMode, config.modo),
            isNull(changes.resolvedAt),
          ),
        )
        .orderBy(changes.id)
        .limit(257)
        .for("update");
      assertAllowed(
        pendentes.length <= 256 &&
          pendentes.every(
            (p) =>
              p.requestStartedAt === null &&
              p.providerScheduleId === null &&
              p.providerInvoiceId === null &&
              !p.reviewRequired &&
              (p.status === "quoted" || p.status === "accepted"),
          ),
        "COBRANCA_EM_CONFERENCIA",
        "Confira ou cancele as trocas já enviadas antes de cancelar a renovação.",
      );
      const agora = await atual.nativa.conferirPrazo(autor.login);
      for (const proposta of pendentes) {
        await tx
          .update(changes)
          .set({ status: "canceled", resolvedAt: agora, reviewRequired: false })
          .where(eq(changes.id, proposta.id));
        await logAuditEventStrict(
          "recreio.plan_change_closed",
          autor.contaId,
          {
            app: "recreio",
            groupId: grupoId,
            planChangeId: proposta.id,
            state: "canceled_before_attempt",
          },
          { writer: tx },
        );
      }
      const [criado] = await tx
        .insert(cancellations)
        .values({
          id: pedido.pedidoId,
          subscriptionId: contrato.subscriptionId,
          purchaseId: contrato.purchaseId,
          groupId: grupoId,
          payerUserId: autor.contaId,
          providerMode: config.modo,
          originProductId: contrato.originProductId,
          expectedContractRevision: contrato.revision,
          expectedProductId: contrato.currentProductId,
          expectedPriceId: contrato.currentPriceId,
          expectedPeriodEnd: origem.periodEnd,
          providerCustomerId: origem.providerCustomerId,
          providerSubscriptionId: origem.providerSubscriptionId,
          initiator: "native",
          policyVersion: pedido.versaoDasCondicoes,
          source: fonte,
          authenticatedAt: autor.login.criadoEm,
          acceptedAt: agora,
          state: "accepted",
          nextAttemptAt: agora,
          createdAt: agora,
          updatedAt: agora,
        })
        .onConflictDoNothing({ target: cancellations.id })
        .returning();
      assertAllowed(criado, "COBRANCA", "Não foi possível registrar o cancelamento da renovação.");
      await logAuditEventStrict(
        "recreio.renewal_cancellation_accepted",
        autor.contaId,
        {
          app: "recreio",
          groupId: grupoId,
          cancellationId: criado.id,
          subscriptionId: contrato.subscriptionId,
          revision: contrato.revision,
          state: "accepted",
        },
        { writer: tx },
      );
      await atual.nativa.conferirPrazo(autor.login);
      return reciboDoCancelamentoDaRenovacao(criado);
    }),
  );
}

/** Consulta somente do próprio recibo, sem acionar provedor ou renovar aceite. */
export function consultarCancelamentoDaRenovacaoNoBanco(
  autor: IdentidadeNativa,
  pedidoId: string,
  modo: StripeMode,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativa = await autorizarContaNativa(tx, autor, "share", "share", "financeiro");
    const [linha] = await tx
      .select()
      .from(cancellations)
      .where(
        and(
          eq(cancellations.id, pedidoId),
          eq(cancellations.payerUserId, autor.contaId),
          eq(cancellations.providerMode, modo),
        ),
      )
      .for("share");
    assertAllowed(linha, "COBRANCA", "Pedido não disponível.");
    await nativa.conferirPrazo();
    return reciboDoCancelamentoDaRenovacao(linha);
  });
}
