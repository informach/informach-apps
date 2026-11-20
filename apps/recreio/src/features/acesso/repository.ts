import "server-only";
import { getProSubscription } from "@informach/billing";
import { and, type Database, db, desc, eq, gt, inArray, isNotNull, sql } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  customers,
  recreioEntitlements as entitlements,
  recreioBillingReconciliations as financialJobs,
  recreioFundingObservations as fundingObservations,
  recreioPaymentFunding as fundingProofs,
  recreioGroups as groups,
  subscriptionPaymentPeriods as paidPeriods,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  subscriptions,
} from "@informach/db/schema";
import {
  type Concessao,
  type FatosDoPagamento,
  type GrupoId,
  GrupoIdSchema,
  type PerfilId,
  PerfilIdSchema,
  type StatusDaAssinatura,
} from "@informach/recreio";
import { VERSAO_DO_FINANCIAMENTO } from "@/features/cobranca/financiamento-regras";
import { schema as EnvironmentSchema } from "@/lib/environment";
import type { Transacao } from "@/lib/repository";

/**
 * Leitura dos fatos do direito de jogar. A área `features/acesso` é o único
 * lugar do app que lê assinaturas e concessões para decidir acesso
 * (`fronteira.test.ts` confere). Aqui não há regra: só o que está no banco.
 */

const APP = "recreio";

/** Personal history projection for the already admitted account snapshot.
 * Only the original commercial owner; membership, payment or guardianship
 * never broadens this query. No grant decision, operator IDs or reason codes. */
export function lerConcessoesPessoaisDaConta(
  tx: Transacao,
  contaId: string,
  apos: string | null,
  limite: number,
) {
  if (
    !contaId ||
    contaId.length > 256 ||
    !Number.isSafeInteger(limite) ||
    limite < 1 ||
    limite > 100
  )
    throw new Error("Invalid personal concession page");
  return tx
    .select({
      cursor: entitlements.id,
      tipo: entitlements.kind,
      plano: entitlements.tier,
      inicioEm: entitlements.startsAt,
      fimEm: entitlements.endsAt,
      criadaEm: entitlements.createdAt,
      revogadaEm: entitlements.revokedAt,
    })
    .from(entitlements)
    .innerJoin(groups, eq(groups.id, entitlements.groupId))
    .where(and(eq(groups.ownerUserId, contaId), apos ? gt(entitlements.id, apos) : undefined))
    .orderBy(entitlements.id)
    .limit(limite);
}

/** Scoped financial identity for an admitted native plan attempt. This does
 * not decide access or expose a generic subscription query to callers. */
export async function lerOrigemDaAssinaturaParaTroca(
  tx: Transacao,
  subscriptionId: string,
  payerId: string,
) {
  const [origem] = await tx
    .select({
      customerId: customers.id,
      providerCustomerId: customers.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.provider, "stripe"),
        eq(customers.provider, "stripe"),
        eq(customers.app, APP),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, payerId),
      ),
    )
    .for("share");
  return origem ?? null;
}

/** Situações que não dão acesso; `getProSubscription` cobre as que dão. */
const SEM_ACESSO: StatusDaAssinatura[] = [
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "canceled",
  "paused",
];

export type AssinaturaLida = {
  id: string;
  status: StatusDaAssinatura;
  productId: string;
  inicioDoPeriodo: Date;
  fimDoPeriodo: Date;
  fimDoTeste: Date | null;
  /** Data em que a assinatura termina por cancelamento agendado. */
  cancelaEm: Date | null;
  financeiro: Pick<
    FatosDoPagamento,
    "precoId" | "origemAdmitida" | "conferidoEm" | "emConferencia" | "periodos"
  >;
};

const ModoFinanceiroSchema = EnvironmentSchema.pick({ STRIPE_MODE: true });
function semFinanceiro(precoId: string): AssinaturaLida["financeiro"] {
  return { precoId, origemAdmitida: false, conferidoEm: null, emConferencia: true, periodos: [] };
}

/** Uses the same mode schema without loading Next/runtime secrets: operational
 * concession scripts can still compose this reader with their own environment.
 */
async function lerPagamentoDaAssinatura(
  ativa: NonNullable<Awaited<ReturnType<typeof getProSubscription>>>,
  grupoId: GrupoId,
  donoId: string,
  conexao: Pick<Database, "select">,
): Promise<AssinaturaLida["financeiro"]> {
  const modo = ModoFinanceiroSchema.safeParse({ STRIPE_MODE: process.env.STRIPE_MODE });
  if (!modo.success) throw new Error("Invalid environment: STRIPE_MODE");
  const [contrato] = await conexao
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, ativa.id))
    .limit(1);
  // A current authority always takes precedence. A mismatched row must not
  // fall back to the original purchase or another historical applied change.
  const ofertaAtualConferida =
    !contrato ||
    (contrato.payerUserId === donoId &&
      contrato.groupId === grupoId &&
      contrato.providerMode === modo.data.STRIPE_MODE &&
      contrato.currentProductId === ativa.productId &&
      contrato.currentPriceId === ativa.providerPriceId);
  const [[conferencia], [origem], periodos] = await Promise.all([
    conexao
      .select({ confirmedAt: financialJobs.lastConfirmedAt, review: financialJobs.reviewRequired })
      .from(financialJobs)
      .where(
        and(
          eq(financialJobs.payerUserId, donoId),
          eq(financialJobs.groupId, grupoId),
          eq(financialJobs.providerMode, modo.data.STRIPE_MODE),
        ),
      )
      .limit(1),
    conexao
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.payerUserId, donoId),
          eq(purchases.groupId, grupoId),
          eq(purchases.providerMode, modo.data.STRIPE_MODE),
          eq(purchases.providerSubscriptionId, ativa.providerSubscriptionId),
          eq(purchases.productId, contrato?.originProductId ?? ativa.productId),
          ...(contrato ? [eq(purchases.id, contrato.purchaseId)] : []),
          eq(purchases.resolution, "checkout_completed"),
          eq(purchases.reviewRequired, false),
          isNotNull(purchases.requestStartedAt),
          isNotNull(purchases.providerSessionId),
          isNotNull(purchases.resolvedAt),
        ),
      )
      .limit(1),
    conexao
      .select({
        precoId: paidPeriods.providerPriceId,
        inicio: paidPeriods.periodStart,
        fim: paidPeriods.periodEnd,
        pagoEm: paidPeriods.paidAt,
        estornado: paidPeriods.fullyRefunded,
        contestado: paidPeriods.disputed,
        financiadoAte: sql<Date | null>`case when
          ${fundingObservations.fundingStatus}='verified'
          and ${fundingObservations.policyVersion}=${VERSAO_DO_FINANCIAMENTO}
          and ${fundingObservations.subscriptionId}=${paidPeriods.subscriptionId}
          and ${fundingObservations.provider}='stripe'
          and ${fundingObservations.groupId}=${grupoId}
          and ${fundingObservations.payerUserId}=${donoId}
          and ${fundingObservations.providerMode}=${modo.data.STRIPE_MODE}
          and ${fundingObservations.purchaseId}=${contrato?.purchaseId ?? null}
          and ${fundingObservations.originProductId}=${contrato?.originProductId ?? null}
          and ${fundingProofs.observedAt}=${paidPeriods.reconciledAt}
          then ${fundingObservations.fundedUntil} else null end`.mapWith(paidPeriods.periodEnd),
      })
      .from(paidPeriods)
      .leftJoin(fundingProofs, eq(fundingProofs.paymentPeriodId, paidPeriods.id))
      .leftJoin(
        fundingObservations,
        and(
          eq(fundingObservations.id, fundingProofs.observationId),
          eq(fundingObservations.paymentPeriodId, paidPeriods.id),
        ),
      )
      .where(and(eq(paidPeriods.subscriptionId, ativa.id), eq(paidPeriods.provider, "stripe"))),
  ]);
  return {
    precoId: ativa.providerPriceId,
    origemAdmitida: Boolean(
      origem &&
        ofertaAtualConferida &&
        ativa.providerObservedAt &&
        conferencia?.confirmedAt &&
        (!contrato?.currentPlanAppliedAt ||
          contrato.currentPlanAppliedAt <= conferencia.confirmedAt) &&
        ativa.providerObservedAt <= conferencia.confirmedAt,
    ),
    conferidoEm: conferencia?.confirmedAt ?? null,
    emConferencia: (conferencia?.review ?? true) || (contrato?.coverageReviewRequired ?? false),
    periodos,
  };
}

export type FatosLidos = {
  perfil: {
    id: PerfilId;
    status: "active" | "suspended";
    coberturaLigada: boolean;
    versaoDaPolitica: number;
  };
  grupo: FatosDoGrupo | null;
};

export type FatosDoGrupo = {
  id: GrupoId;
  /** Perfis do grupo com a cobertura ligada, do mais antigo ao mais novo. */
  cobertos: PerfilId[];
  /** A assinatura que dá acesso, se houver. */
  assinaturaAtiva: AssinaturaLida | null;
  /** A assinatura mais recente que não dá acesso (atrasada, encerrada). */
  assinaturaInativa: AssinaturaLida | null;
  concessoes: Concessao[];
};

async function assinaturaInativaMaisRecente(
  donoId: string,
  conexao: Pick<Database, "select">,
): Promise<AssinaturaLida | null> {
  const [linha] = await conexao
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      productId: subscriptions.productId,
      providerPriceId: subscriptions.providerPriceId,
      inicioDoPeriodo: subscriptions.currentPeriodStart,
      fimDoPeriodo: subscriptions.currentPeriodEnd,
      fimDoTeste: subscriptions.trialEnd,
      cancelaEm: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, donoId),
        eq(customers.app, APP),
        inArray(subscriptions.status, SEM_ACESSO),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd), desc(subscriptions.createdAt))
    .limit(1);
  return linha ? { ...linha, financeiro: semFinanceiro(linha.providerPriceId) } : null;
}

/** Tudo o que `decidirAcesso` precisa saber sobre um perfil, ou `null` se ele não existe. */
export async function lerFatosDeAcesso(
  perfilId: PerfilId,
  conexao: Pick<Database, "select"> = db,
): Promise<FatosLidos | null> {
  const [perfil] = await conexao
    .select({
      id: profiles.id,
      status: profiles.status,
      groupId: profiles.groupId,
      coverageEnabled: profiles.coverageEnabled,
      policyVersion: profiles.policyVersion,
    })
    .from(profiles)
    .where(eq(profiles.id, perfilId));
  if (!perfil) return null;
  const lido = {
    id: PerfilIdSchema.parse(perfil.id),
    status: perfil.status,
    coberturaLigada: perfil.coverageEnabled,
    versaoDaPolitica: perfil.policyVersion,
  };
  return {
    perfil: lido,
    grupo: perfil.groupId
      ? await lerFatosDoGrupo(GrupoIdSchema.parse(perfil.groupId), conexao)
      : null,
  };
}

/** Mesmo carregador financeiro para um pagante que não ocupa perfil de jogador. */
export async function lerFatosDoGrupo(
  grupoId: GrupoId,
  conexao: Pick<Database, "select"> = db,
): Promise<FatosDoGrupo | null> {
  const [grupo] = await conexao
    .select({ id: groups.id, ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(eq(groups.id, grupoId));
  if (!grupo) return null;
  const [cobertos, ativa, inativa, concessoes] = await Promise.all([
    conexao
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.groupId, grupo.id), eq(profiles.coverageEnabled, true)))
      .orderBy(profiles.createdAt, profiles.id),
    getProSubscription(
      { db: conexao, provider: "stripe", app: APP },
      { type: "user", id: grupo.ownerUserId },
    ),
    assinaturaInativaMaisRecente(grupo.ownerUserId, conexao),
    conexao
      .select({
        id: entitlements.id,
        kind: entitlements.kind,
        tier: entitlements.tier,
        inicio: entitlements.startsAt,
        fim: entitlements.endsAt,
        revogadaEm: entitlements.revokedAt,
      })
      .from(entitlements)
      .where(eq(entitlements.groupId, grupo.id)),
  ]);
  return {
    id: GrupoIdSchema.parse(grupo.id),
    cobertos: cobertos.map((linha) => PerfilIdSchema.parse(linha.id)),
    assinaturaAtiva: ativa && {
      id: ativa.id,
      status: ativa.status,
      productId: ativa.productId,
      inicioDoPeriodo: ativa.currentPeriodStart,
      fimDoPeriodo: ativa.currentPeriodEnd,
      fimDoTeste: ativa.trialEnd,
      cancelaEm: ativa.cancelAtPeriodEnd,
      financeiro: await lerPagamentoDaAssinatura(ativa, grupoId, grupo.ownerUserId, conexao),
    },
    assinaturaInativa: inativa,
    concessoes,
  };
}
