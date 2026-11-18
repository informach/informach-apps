import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { and, eq, inArray } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import { type AgendaDaTrocaObservada, conferirAgendaObservada } from "./troca-execucao-repository";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

/** Runs only inside the complete financial confirmation transaction. A schedule
 * phase is a commercial change, never payment proof; the existing paid-period
 * reader and final SID revalidation remain authoritative for game access. */
export async function aplicarReducoesObservadasLocked(
  tx: Transacao,
  prova: TentativaDeConciliacao,
  observacoes: readonly AgendaDaTrocaObservada[],
  snapshots: readonly SubscriptionPaymentSnapshot[],
  agora: Date,
) {
  assertAllowed(
    observacoes.length <= 1,
    "ORIGEM_FINANCEIRA",
    "Há trocas simultâneas que exigem conferência.",
  );
  for (const observacao of observacoes) {
    if (observacao.estado !== "applied") continue;
    const [linha] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, observacao.tentativa.id),
          eq(changes.payerUserId, prova.payerUserId),
          eq(changes.groupId, prova.groupId),
          eq(changes.providerMode, prova.providerMode),
        ),
      )
      .for("update");
    assertAllowed(
      linha?.requestStartedAt &&
        linha.acceptedAt &&
        linha.kind === "downgrade" &&
        linha.resolvedAt === null &&
        linha.expectedContractRevision < 2147483646,
      "ORIGEM_FINANCEIRA",
      "O recibo aplicado exige conferência.",
    );
    conferirAgendaObservada(observacao, linha);
    const snapshot = snapshots.find((s) => s.subscriptionId === observacao.tentativa.assinatura);
    assertAllowed(
      snapshot &&
        prova.customer &&
        snapshot.customerId === prova.customer.providerCustomerId &&
        snapshot.priceId === linha.toPriceId &&
        snapshot.start >= linha.effectiveAt &&
        agora >= linha.effectiveAt &&
        snapshot.observedAt.getTime() === prova.startedAt.getTime() &&
        snapshot.origin?.authorizationId === linha.purchaseId &&
        snapshot.origin.productId === linha.originProductId &&
        snapshot.origin.subjectType === "user" &&
        snapshot.origin.subjectId === prova.payerUserId,
      "ORIGEM_FINANCEIRA",
      "A fase efetiva não corresponde à observação financeira completa.",
    );
    const [contrato] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.subscriptionId, linha.subscriptionId))
      .for("update");
    assertAllowed(
      contrato &&
        contrato.purchaseId === linha.purchaseId &&
        contrato.groupId === prova.groupId &&
        contrato.payerUserId === prova.payerUserId &&
        contrato.providerMode === prova.providerMode &&
        contrato.originProductId === linha.originProductId &&
        contrato.revision === linha.expectedContractRevision &&
        contrato.currentProductId === linha.fromProductId &&
        contrato.currentPriceId === linha.fromPriceId &&
        !contrato.coverageReviewRequired,
      "ORIGEM_FINANCEIRA",
      "A revisão do contrato mudou antes da aplicação.",
    );
    const atuais = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.groupId, prova.groupId))
      .orderBy(profiles.id)
      .for("update");
    const vinculos = atuais.length
      ? await tx
          .select({ perfilId: guardians.profileId })
          .from(guardians)
          .where(
            inArray(
              guardians.profileId,
              atuais.map((p) => p.id),
            ),
          )
          .orderBy(guardians.profileId)
          .for("share")
      : [];
    const selecao = await tx.select().from(selections).where(eq(selections.planChangeId, linha.id));
    let reverSelecao = false;
    try {
      conferirSelecaoDaTroca(
        prova.groupId,
        linha.toProductId,
        selecao,
        perfisParaSelecionarNaTroca(atuais, vinculos),
      );
    } catch (error) {
      if (!(error instanceof AppError) || !["CONFLITO", "LIMITE_DE_PERFIS"].includes(error.code))
        throw error;
      reverSelecao = true;
    }
    if (!reverSelecao) {
      for (const perfil of atuais) {
        const escolha = selecao.find((s) => s.profileReference === perfil.id);
        assertAllowed(escolha, "ORIGEM_FINANCEIRA", "Seleção financeira incompleta.");
        if (escolha.coverageEnabled === perfil.coverageEnabled) continue;
        // The pure rule forbids reactivation by a deferred selection.
        assertAllowed(
          !escolha.coverageEnabled,
          "ORIGEM_FINANCEIRA",
          "Uma seleção antiga não reativa cobertura.",
        );
        await tx
          .update(profiles)
          .set({
            coverageEnabled: false,
            policyVersion: perfil.policyVersion + 1,
            updatedAt: agora,
          })
          .where(eq(profiles.id, perfil.id));
        await invalidarIngressosDoPerfil(tx, PerfilIdSchema.parse(perfil.id));
        await logAuditEventStrict(
          "recreio.group_coverage_updated",
          prova.payerUserId,
          {
            app: "recreio",
            groupId: prova.groupId,
            profileId: perfil.id,
            revision: perfil.policyVersion + 1,
            enabled: false,
          },
          { writer: tx },
        );
      }
    }
    const revisao = linha.expectedContractRevision + 1;
    await tx
      .update(changes)
      .set({
        status: "applied",
        appliedAt: agora,
        appliedRevision: revisao,
        resolvedAt: agora,
        reviewRequired: false,
      })
      .where(eq(changes.id, linha.id));
    await tx
      .update(contracts)
      .set({
        currentProductId: linha.toProductId,
        currentPriceId: linha.toPriceId,
        currentPlanChangeId: linha.id,
        currentPlanAppliedAt: agora,
        revision: revisao,
        coverageReviewRequired: reverSelecao,
      })
      .where(eq(contracts.subscriptionId, linha.subscriptionId));
    await logAuditEventStrict(
      "recreio.plan_change_applied",
      prova.payerUserId,
      {
        app: "recreio",
        groupId: prova.groupId,
        planChangeId: linha.id,
        subscriptionId: linha.subscriptionId,
        revision: revisao,
        state: reverSelecao ? "selection_review" : "applied",
      },
      { writer: tx },
    );
  }
}
