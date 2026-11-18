import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type {
  RecreioUpgradeAttempt,
  RecreioUpgradeObservation,
} from "@informach/billing/providers/stripe-recreio-upgrades";
import type { Product, StripeMode } from "@informach/config";
import { and, db, eq, isNotNull, isNull, sql } from "@informach/db";
import { recreioPlanChanges as changes } from "@informach/db/schema";
import { ContaIdSchema, GrupoIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { lerOrigemDaAssinaturaParaTroca } from "@/features/acesso/repository";
import {
  admitirGrupoDaConciliacao,
  ComposicaoDoGrupoMudou,
} from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import {
  agendarConciliacaoDaCompra,
  lerDadosDaConciliacaoLocked,
  type TentativaDeConciliacao,
} from "./conciliacao-fila-repository";
import { comAdmissaoDeEnvioLocked, termos } from "./troca-execucao-repository";

type Linha = typeof changes.$inferSelect;
const ADMITIDA = Symbol("recreio.upgrade.admitted");
const OBSERVADA = Symbol("recreio.upgrade.observed");
export type TentativaDeAumento = {
  readonly [ADMITIDA]: true;
  readonly id: string;
  readonly paganteId: string;
  readonly grupoId: string;
  readonly modo: StripeMode;
  readonly assinatura: string;
  readonly termos: string;
  readonly entrada: RecreioUpgradeAttempt;
};
export type AumentoObservado = {
  readonly [OBSERVADA]: true;
  readonly tentativa: TentativaDeAumento;
  readonly fatura: RecreioUpgradeObservation;
};
function provaDaLinha(
  linha: Linha,
  customerId: string,
  subscriptionId: string,
): TentativaDeAumento {
  assertAllowed(
    linha.kind === "upgrade" &&
      linha.acceptedAt &&
      linha.requestStartedAt &&
      linha.providerItemId &&
      linha.prorationAt,
    "COBRANCA",
    "Aumento não admitido.",
  );
  return {
    [ADMITIDA]: true,
    id: linha.id,
    paganteId: linha.payerUserId,
    grupoId: linha.groupId,
    modo: linha.providerMode,
    assinatura: subscriptionId,
    termos: termos(linha),
    entrada: {
      intentId: linha.id,
      customerId,
      subscriptionId,
      fromPriceId: linha.fromPriceId,
      toPriceId: linha.toPriceId,
      periodStart: linha.periodStart,
      periodEnd: linha.periodEnd,
      prorationAt: linha.prorationAt,
      origin: {
        authorizationId: linha.purchaseId,
        productId: linha.originProductId,
        payerId: linha.payerUserId,
      },
      quote: {
        itemId: linha.providerItemId,
        amountDueCents: linha.quotedAmountCents,
        subtotalCents: linha.quotedSubtotalCents,
        creditCents: linha.quotedCreditCents,
        totalCents: linha.quotedTotalCents,
        startingBalanceCents: linha.quotedStartingBalanceCents,
        currency: linha.currency,
      },
      requestStartedAt: linha.requestStartedAt,
      ...(linha.providerInvoiceId ? { providerInvoiceId: linha.providerInvoiceId } : {}),
    },
  };
}
export function conferirAumentoObservado(observacao: AumentoObservado, linha: Linha) {
  assertAllowed(
    observacao[OBSERVADA] &&
      observacao.tentativa[ADMITIDA] &&
      observacao.tentativa.id === linha.id &&
      observacao.tentativa.termos === termos(linha) &&
      observacao.fatura.invoiceId === linha.providerInvoiceId,
    "ORIGEM_FINANCEIRA",
    "A observação não corresponde ao aumento admitido.",
  );
}

/** The same native admission as reductions; the attempt and audit commit before
 * any mutation at Stripe. Recovery never turns an unstarted quote into a charge. */
export function admitirTentativaDeAumentoLocked(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
  produtos: readonly Product[],
  somenteRecuperacao: boolean,
) {
  return comAdmissaoDeEnvioLocked(
    autor,
    id,
    modo,
    async (tx, anterior, customerId, subscriptionId, agora) => {
      let linha = anterior;
      if (linha.requestStartedAt === null) {
        assertAllowed(
          !somenteRecuperacao,
          "OPERACAO_EM_CONFERENCIA",
          "A troca ainda não foi enviada.",
        );
        const oferta = produtos.find(
          (p) => p.app === "recreio" && p.kind === "subscription" && p.id === linha.toProductId,
        );
        assertAllowed(
          oferta &&
            oferta.stripePriceId[modo] === linha.toPriceId &&
            oferta.interval === linha.toInterval &&
            oferta.listPrice?.amountCents === linha.toAmountCents &&
            oferta.listPrice.currency === linha.currency,
          "OFERTA",
          "A oferta mudou. Confira a cotação novamente.",
        );
        const [iniciada] = await tx
          .update(changes)
          .set({ status: "sent", requestStartedAt: agora, reviewRequired: true })
          .where(eq(changes.id, linha.id))
          .returning();
        assertAllowed(iniciada, "COBRANCA", "Não foi possível admitir o aumento.");
        linha = iniciada;
        await logAuditEventStrict(
          "recreio.plan_change_attempt_started",
          autor.contaId,
          {
            app: "recreio",
            groupId: linha.groupId,
            planChangeId: linha.id,
            subscriptionId: linha.subscriptionId,
            revision: linha.expectedContractRevision,
            state: "sent",
          },
          { writer: tx },
        );
      }
      await agendarConciliacaoDaCompra(tx, {
        paganteId: linha.payerUserId,
        grupoId: linha.groupId,
        modo,
      });
      return provaDaLinha(linha, customerId, subscriptionId);
    },
    "upgrade",
  );
}

/** A leased financial attempt, with exact current customer scope, is the only
 * technical authority allowed to recover this already admitted mutation. */
export function lerAumentoDaConciliacaoLocked(prova: TentativaDeConciliacao) {
  return lerDadosDaConciliacaoLocked(prova, async (tx) => {
    assertAllowed(prova.customer, "COBRANCA", "Cliente financeiro não confirmado.");
    const linhas = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.payerUserId, prova.payerUserId),
          eq(changes.groupId, prova.groupId),
          eq(changes.providerMode, prova.providerMode),
          eq(changes.kind, "upgrade"),
          isNull(changes.resolvedAt),
          isNotNull(changes.requestStartedAt),
        ),
      )
      .limit(2)
      .for("update");
    assertAllowed(
      linhas.length <= 1,
      "ORIGEM_FINANCEIRA",
      "Há aumentos simultâneos que exigem conferência.",
    );
    const linha = linhas[0];
    if (!linha) return null;
    const origem = await lerOrigemDaAssinaturaParaTroca(
      tx,
      linha.subscriptionId,
      prova.payerUserId,
    );
    assertAllowed(
      origem &&
        origem.customerId === prova.customer.id &&
        origem.providerCustomerId === prova.customer.providerCustomerId &&
        linha.status === "sent",
      "ORIGEM_FINANCEIRA",
      "A origem do aumento exige conferência.",
    );
    return provaDaLinha(linha, origem.providerCustomerId, origem.providerSubscriptionId);
  });
}

/** Technical capture survives logout. The commercial revision remains unchanged
 * until the complete financial transaction validates this exact own invoice. */
export async function capturarFaturaDoAumentoLocked(
  prova: TentativaDeAumento,
  observacao: RecreioUpgradeObservation | null,
): Promise<AumentoObservado | null> {
  assertAllowed(prova[ADMITIDA], "COBRANCA", "Aumento não admitido.");
  if (observacao)
    assertAllowed(
      /^in_[A-Za-z0-9_]{5,240}$/.test(observacao.invoiceId),
      "COBRANCA",
      "Fatura não reconhecida.",
    );
  for (const repeticao of [0, 1]) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`set local transaction_timeout='15s'`);
        await tx.execute(sql`set local statement_timeout='5s'`);
        await tx.execute(sql`set local lock_timeout='2s'`);
        await admitirGrupoDaConciliacao(
          tx,
          ContaIdSchema.parse(prova.paganteId),
          GrupoIdSchema.parse(prova.grupoId),
        );
        const [linha] = await tx
          .select()
          .from(changes)
          .where(
            and(
              eq(changes.id, prova.id),
              eq(changes.payerUserId, prova.paganteId),
              eq(changes.groupId, prova.grupoId),
              eq(changes.providerMode, prova.modo),
            ),
          )
          .for("update");
        assertAllowed(
          linha?.requestStartedAt &&
            linha.kind === "upgrade" &&
            linha.resolvedAt === null &&
            termos(linha) === prova.termos &&
            (!linha.providerInvoiceId ||
              linha.providerInvoiceId === observacao?.invoiceId ||
              observacao === null),
          "CONFLITO",
          "A tentativa de aumento exige conferência.",
        );
        const [tempo] = await tx
          .select({ agora: sql<Date>`${AGORA}`.mapWith(changes.quotedAt) })
          .from(changes)
          .where(eq(changes.id, linha.id));
        assertAllowed(tempo, "COBRANCA", "Aumento não disponível.");
        const falhou = observacao?.outcome === "failed";
        await tx
          .update(changes)
          .set({
            ...(observacao ? { providerInvoiceId: observacao.invoiceId } : {}),
            status: falhou ? "failed" : "sent",
            reviewRequired: observacao === null || observacao.outcome === "applied",
            ...(falhou ? { resolvedAt: tempo.agora } : {}),
          })
          .where(eq(changes.id, linha.id));
        await agendarConciliacaoDaCompra(tx, {
          paganteId: prova.paganteId,
          grupoId: prova.grupoId,
          modo: prova.modo,
        });
        await logAuditEventStrict(
          "recreio.plan_change_provider_observed",
          prova.paganteId,
          {
            app: "recreio",
            groupId: prova.grupoId,
            planChangeId: prova.id,
            subscriptionId: linha.subscriptionId,
            revision: linha.expectedContractRevision,
            state:
              observacao?.outcome === "applied"
                ? "awaiting_application_confirmation"
                : (observacao?.outcome ?? "unconfirmed"),
          },
          { writer: tx },
        );
        const resultado: AumentoObservado | null = observacao
          ? { [OBSERVADA]: true, tentativa: prova, fatura: observacao }
          : null;
        return resultado;
      });
    } catch (error) {
      if (error instanceof ComposicaoDoGrupoMudou && repeticao === 0) continue;
      throw error;
    }
  }
  throw new Error("Upgrade capture did not produce an outcome");
}
