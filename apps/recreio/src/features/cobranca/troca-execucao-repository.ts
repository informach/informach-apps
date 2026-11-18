import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import type {
  PlanScheduleOutcome,
  RecreioPlanScheduleInput,
} from "@informach/billing/providers/stripe-plans";
import type { Product, StripeMode } from "@informach/config";
import { and, db, eq, isNotNull, isNull, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { ContaIdSchema, GrupoIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { lerOrigemDaAssinaturaParaTroca } from "@/features/acesso/repository";
import {
  admitirGrupoDaConciliacao,
  admitirGrupoDoTitular,
  ComposicaoDoGrupoMudou,
} from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  agendarConciliacaoDaCompra,
  lerDadosDaConciliacaoLocked,
  type TentativaDeConciliacao,
} from "./conciliacao-fila-repository";
import { lerContratoParaTrocaLocked } from "./troca-contexto-repository";
import { reciboDaTroca } from "./troca-cotacao-repository";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

type Linha = typeof changes.$inferSelect;
const ADMITIDA = Symbol("recreio.plan-change.admitted");
export type TentativaDeTroca = {
  readonly [ADMITIDA]: true;
  readonly id: string;
  readonly paganteId: string;
  readonly grupoId: string;
  readonly modo: StripeMode;
  readonly assinatura: string;
  readonly termos: string;
  readonly scheduleId: string | null;
  readonly cancelar: boolean;
  readonly entrada: RecreioPlanScheduleInput;
};
const OBSERVADA = Symbol("recreio.plan-change.observed");
export type AgendaDaTrocaObservada = {
  readonly [OBSERVADA]: true;
  readonly tentativa: TentativaDeTroca;
  readonly scheduleId: string;
  readonly estado: PlanScheduleOutcome;
};

export function conferirAgendaObservada(observacao: AgendaDaTrocaObservada, linha: Linha) {
  assertAllowed(
    observacao[OBSERVADA] === true &&
      observacao.tentativa[ADMITIDA] === true &&
      observacao.tentativa.id === linha.id &&
      observacao.tentativa.termos === termos(linha) &&
      observacao.scheduleId === linha.providerScheduleId,
    "ORIGEM_FINANCEIRA",
    "A observação da troca não corresponde ao recibo admitido.",
  );
}

function provaDaLinha(linha: Linha, customerId: string, subscriptionId: string): TentativaDeTroca {
  assertAllowed(linha.requestStartedAt, "COBRANCA", "Tentativa não admitida.");
  return {
    [ADMITIDA]: true,
    id: linha.id,
    paganteId: linha.payerUserId,
    grupoId: linha.groupId,
    modo: linha.providerMode,
    assinatura: subscriptionId,
    termos: termos(linha),
    scheduleId: linha.providerScheduleId,
    cancelar: linha.cancelRequestedAt !== null,
    entrada: {
      intentId: linha.id,
      customerId,
      subscriptionId,
      fromPriceId: linha.fromPriceId,
      toPriceId: linha.toPriceId,
      toProductId: linha.toProductId,
      interval: linha.toInterval,
      effectiveAt: linha.effectiveAt,
      requestStartedAt: linha.requestStartedAt,
      origin: {
        authorizationId: linha.purchaseId,
        productId: linha.originProductId,
        payerId: linha.payerUserId,
      },
    },
  };
}

/** Only a leased financial attempt can recover an already admitted reduction.
 * Quoted/accepted rows are not authority for a technical provider mutation. */
export function lerTrocaDaConciliacaoLocked(prova: TentativaDeConciliacao) {
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
          eq(changes.kind, "downgrade"),
          isNull(changes.resolvedAt),
          isNotNull(changes.requestStartedAt),
        ),
      )
      .limit(2)
      .for("update");
    assertAllowed(
      linhas.length <= 1,
      "ORIGEM_FINANCEIRA",
      "Há trocas simultâneas que exigem conferência.",
    );
    const atual = linhas[0];
    if (!atual) return null;
    const origem = await lerOrigemDaAssinaturaParaTroca(
      tx,
      atual.subscriptionId,
      prova.payerUserId,
    );
    assertAllowed(
      origem &&
        origem.customerId === prova.customer.id &&
        origem.providerCustomerId === prova.customer.providerCustomerId &&
        atual.kind === "downgrade" &&
        atual.acceptedAt &&
        ["sent", "scheduled"].includes(atual.status),
      "ORIGEM_FINANCEIRA",
      "A tentativa comercial exige conferência.",
    );
    return provaDaLinha(atual, origem.providerCustomerId, origem.providerSubscriptionId);
  });
}

export function termos(linha: Linha) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: linha.id,
        subscriptionId: linha.subscriptionId,
        purchaseId: linha.purchaseId,
        groupId: linha.groupId,
        payerUserId: linha.payerUserId,
        providerMode: linha.providerMode,
        originProductId: linha.originProductId,
        revision: linha.expectedContractRevision,
        fromProductId: linha.fromProductId,
        fromPriceId: linha.fromPriceId,
        toProductId: linha.toProductId,
        toPriceId: linha.toPriceId,
        toAmountCents: linha.toAmountCents,
        toInterval: linha.toInterval,
        kind: linha.kind,
        periodStart: linha.periodStart,
        periodEnd: linha.periodEnd,
        effectiveAt: linha.effectiveAt,
        prorationAt: linha.prorationAt,
        providerItemId: linha.providerItemId,
        amount: linha.quotedAmountCents,
        subtotal: linha.quotedSubtotalCents,
        credit: linha.quotedCreditCents,
        total: linha.quotedTotalCents,
        startingBalance: linha.quotedStartingBalanceCents,
        currency: linha.currency,
        policy: linha.policyVersion,
        quotedAt: linha.quotedAt,
        expiresAt: linha.quoteExpiresAt,
        acceptedAt: linha.acceptedAt,
        startedAt: linha.requestStartedAt,
        cancelRequestedAt: linha.cancelRequestedAt,
      }),
    )
    .digest("hex");
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
async function grupoDaTroca(autor: AutorNativoRecente, id: string, modo: StripeMode) {
  const [pista] = await db
    .select({ groupId: changes.groupId })
    .from(changes)
    .where(
      and(
        eq(changes.id, id),
        eq(changes.payerUserId, autor.contaId),
        eq(changes.providerMode, modo),
      ),
    );
  assertAllowed(pista, "COBRANCA", "Troca não disponível.");
  return GrupoIdSchema.parse(pista.groupId);
}
export async function comAdmissaoDeEnvioLocked<T>(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
  executar: (
    tx: Transacao,
    linha: Linha,
    customerId: string,
    providerSubscriptionId: string,
    agora: Date,
  ) => Promise<T>,
  tipo: "upgrade" | "downgrade" = "downgrade",
) {
  const grupoId = await grupoDaTroca(autor, id, modo);
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update");
    const agora = await atual.nativa.conferirPrazo(autor.login);
    const [linha] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, id),
          eq(changes.groupId, grupoId),
          eq(changes.payerUserId, autor.contaId),
          eq(changes.providerMode, modo),
        ),
      )
      .for("update");
    assertAllowed(
      linha?.acceptedAt &&
        linha.kind === tipo &&
        linha.resolvedAt === null &&
        ["accepted", "sent", "scheduled"].includes(linha.status),
      "CONFLITO",
      "Confira o aceite e o estado da troca antes de enviar.",
    );
    if (linha.requestStartedAt === null) {
      assertAllowed(
        agora < linha.quoteExpiresAt && linha.cancelRequestedAt === null,
        "COTACAO_VENCIDA",
        "A cotação venceu ou foi encerrada. Confira novamente.",
      );
      const { contrato, assinatura } = await lerContratoParaTrocaLocked(tx, {
        grupoId,
        paganteId: autor.contaId,
        modo,
        revisao: linha.expectedContractRevision,
        agora,
      });
      assertAllowed(
        contrato.subscriptionId === linha.subscriptionId &&
          contrato.purchaseId === linha.purchaseId &&
          contrato.currentProductId === linha.fromProductId &&
          contrato.currentPriceId === linha.fromPriceId &&
          assinatura.fimDoPeriodo.getTime() === linha.periodEnd.getTime() &&
          assinatura.inicioDoPeriodo.getTime() === linha.periodStart.getTime(),
        "CONFLITO",
        "O contrato mudou antes do envio.",
      );
      const selecao = await tx
        .select()
        .from(selections)
        .where(eq(selections.planChangeId, linha.id));
      conferirSelecaoDaTroca(
        grupoId,
        linha.toProductId,
        selecao,
        perfisParaSelecionarNaTroca(atual.perfis, atual.vinculos),
      );
    }
    const origem = await lerOrigemDaAssinaturaParaTroca(tx, linha.subscriptionId, autor.contaId);
    assertAllowed(origem, "COBRANCA", "A origem financeira da troca exige conferência.");
    const resultado = await executar(
      tx,
      linha,
      origem.providerCustomerId,
      origem.providerSubscriptionId,
      agora,
    );
    const final = await atual.nativa.conferirPrazo(autor.login);
    assertAllowed(
      linha.requestStartedAt !== null || final < linha.quoteExpiresAt,
      "COTACAO_VENCIDA",
      "Confira a cotação novamente.",
    );
    if (linha.requestStartedAt === null)
      await lerContratoParaTrocaLocked(tx, {
        grupoId,
        paganteId: autor.contaId,
        modo,
        revisao: linha.expectedContractRevision,
        agora: final,
      });
    return resultado;
  });
}

/** Caller holds the payer lifecycle across each phase and provider I/O. */
export function conferirTrocaParaEnvioLocked(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
  tipo: "upgrade" | "downgrade" = "downgrade",
) {
  return comAdmissaoDeEnvioLocked(
    autor,
    id,
    modo,
    async (_tx, linha) => ({
      jaAdmitida: linha.requestStartedAt !== null,
    }),
    tipo,
  );
}
export function admitirTentativaDaTrocaLocked(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
  produtos: readonly Product[],
  somenteRecuperacao: boolean,
): Promise<TentativaDeTroca> {
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
        assertAllowed(iniciada, "COBRANCA", "Não foi possível admitir a tentativa.");
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
      assertAllowed(linha.requestStartedAt, "COBRANCA", "Tentativa não admitida.");
      await agendarConciliacaoDaCompra(tx, {
        paganteId: linha.payerUserId,
        grupoId: linha.groupId,
        modo,
      });
      return provaDaLinha(linha, customerId, subscriptionId);
    },
  );
}

/** Native explicit cancellation intent. Existing financial facts/management
 * remain available without new sales, a current paid period or a player. */
export async function admitirCancelamentoDaTrocaLocked(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
): Promise<TentativaDeTroca | null> {
  const grupoId = await grupoDaTroca(autor, id, modo);
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update");
    const agora = await atual.nativa.conferirPrazo(autor.login);
    const [anterior] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, id),
          eq(changes.groupId, grupoId),
          eq(changes.payerUserId, autor.contaId),
          eq(changes.providerMode, modo),
        ),
      )
      .for("update");
    assertAllowed(anterior, "COBRANCA", "Troca não disponível.");
    if (anterior.resolvedAt !== null) {
      await atual.nativa.conferirPrazo(autor.login);
      return null;
    }
    assertAllowed(
      anterior.kind === "downgrade" &&
        anterior.acceptedAt &&
        anterior.requestStartedAt &&
        ["sent", "scheduled"].includes(anterior.status),
      "CONFLITO",
      "Use o encerramento de pedido não enviado para uma cotação sem tentativa.",
    );
    const origem = await lerOrigemDaAssinaturaParaTroca(tx, anterior.subscriptionId, autor.contaId);
    assertAllowed(origem, "ORIGEM_FINANCEIRA", "A origem financeira exige conferência.");
    let linha = anterior;
    if (linha.cancelRequestedAt === null) {
      const [cancelando] = await tx
        .update(changes)
        .set({ cancelRequestedAt: agora, reviewRequired: true })
        .where(eq(changes.id, linha.id))
        .returning();
      assertAllowed(cancelando, "COBRANCA", "Não foi possível registrar o pedido de cancelamento.");
      linha = cancelando;
      await logAuditEventStrict(
        "recreio.plan_change_cancel_requested",
        autor.contaId,
        {
          app: "recreio",
          groupId: linha.groupId,
          planChangeId: linha.id,
          subscriptionId: linha.subscriptionId,
          revision: linha.expectedContractRevision,
          state: "requested",
        },
        { writer: tx },
      );
    }
    await agendarConciliacaoDaCompra(tx, { paganteId: autor.contaId, grupoId, modo });
    await atual.nativa.conferirPrazo(autor.login);
    return provaDaLinha(linha, origem.providerCustomerId, origem.providerSubscriptionId);
  });
}

export async function capturarAgendaDaTrocaLocked(
  prova: TentativaDeTroca,
  scheduleId: string | null,
  observado: PlanScheduleOutcome | "identified" | "unconfirmed",
): Promise<AgendaDaTrocaObservada | undefined> {
  assertAllowed(prova[ADMITIDA], "COBRANCA", "Tentativa não admitida.");
  if (scheduleId !== null)
    assertAllowed(
      /^sub_sched_[A-Za-z0-9_]{5,240}$/.test(scheduleId),
      "COBRANCA",
      "Agenda não reconhecida.",
    );
  for (const repeticao of [0, 1]) {
    try {
      return await db.transaction(async (tx) => {
        await limites(tx);
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
            linha.resolvedAt === null &&
            termos(linha) === prova.termos &&
            (!linha.providerScheduleId || linha.providerScheduleId === scheduleId),
          "CONFLITO",
          "A tentativa da troca exige conferência.",
        );
        const [tempo] = await tx
          .select({ agora: sql<Date>`${AGORA}`.mapWith(changes.quotedAt) })
          .from(changes)
          .where(eq(changes.id, prova.id));
        assertAllowed(tempo, "COBRANCA", "Troca não disponível.");
        const terminal = observado === "canceled" || observado === "failed";
        assertAllowed(
          observado === "unconfirmed" || scheduleId,
          "COBRANCA",
          "Agenda não confirmada.",
        );
        await tx
          .update(changes)
          .set({
            ...(scheduleId ? { providerScheduleId: scheduleId } : {}),
            status:
              observado === "canceled"
                ? "canceled"
                : observado === "failed"
                  ? "failed"
                  : observado === "scheduled" || observado === "applied"
                    ? "scheduled"
                    : linha.status,
            reviewRequired: !terminal && observado !== "scheduled",
            ...(terminal ? { resolvedAt: tempo.agora } : {}),
          })
          .where(eq(changes.id, prova.id));
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
            state: observado === "applied" ? "awaiting_application_confirmation" : observado,
          },
          { writer: tx },
        );
        if (scheduleId && observado !== "identified" && observado !== "unconfirmed") {
          const observacao: AgendaDaTrocaObservada = {
            [OBSERVADA]: true,
            tentativa: prova,
            scheduleId,
            estado: observado,
          };
          return observacao;
        }
      });
    } catch (error) {
      if (error instanceof ComposicaoDoGrupoMudou && repeticao === 0) continue;
      throw error;
    }
  }
}

export async function conferirResultadoDaTrocaNoBanco(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
) {
  const grupoId = await grupoDaTroca(autor, id, modo);
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share");
    await atual.nativa.conferirPrazo(autor.login);
    const [linha] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, id),
          eq(changes.payerUserId, autor.contaId),
          eq(changes.groupId, grupoId),
          eq(changes.providerMode, modo),
        ),
      );
    assertAllowed(linha, "COBRANCA", "Troca não disponível.");
    await atual.nativa.conferirPrazo(autor.login);
    return reciboDaTroca(linha);
  });
}
