import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type {
  RecreioUpgradeProvider,
  RecreioUpgradeScope,
} from "@informach/billing/providers/stripe-recreio-upgrades";
import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limiteFinanceiroDaAssinatura } from "@/features/acesso/decisao";
import { lerOrigemDaAssinaturaParaTroca } from "@/features/acesso/repository";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { comCicloDeCobranca } from "./lifecycle";
import { lerContratoParaTrocaLocked } from "./troca-contexto-repository";
import { reciboDaTroca } from "./troca-cotacao-repository";
import { PRAZO_DA_COTACAO_MS, type PrepararTroca, VERSAO_DA_TROCA } from "./troca-entrada";
import { classificarTrocaDePlano } from "./troca-regras";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

export type RuntimeDaCotacaoDeAumento = {
  modo: StripeMode;
  produtos: readonly Product[];
  conferirCatalogo: (budget: { deadlineMs: number }) => Promise<void>;
  aumentos: Pick<RecreioUpgradeProvider, "preview">;
};

async function carregar(
  tx: Transacao,
  autor: AutorNativoRecente,
  pedido: PrepararTroca,
  runtime: RuntimeDaCotacaoDeAumento,
  prorationAt?: Date,
) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  const atual = await admitirGrupoDoTitular(tx, autor, pedido.grupoId, "update");
  const agora = await atual.nativa.conferirPrazo(autor.login);
  const [existente] = await tx
    .select()
    .from(changes)
    .where(
      and(
        eq(changes.id, pedido.pedidoId),
        eq(changes.groupId, pedido.grupoId),
        eq(changes.payerUserId, autor.contaId),
        eq(changes.providerMode, runtime.modo),
      ),
    )
    .for("update");
  if (existente) {
    const escolhidos = await tx
      .select()
      .from(selections)
      .where(eq(selections.planChangeId, existente.id));
    assertAllowed(
      existente.kind === "upgrade" &&
        existente.toProductId === pedido.produtoDestino &&
        existente.expectedContractRevision === pedido.revisaoContrato &&
        escolhidos.length === pedido.perfis.length &&
        escolhidos.every((s) =>
          pedido.perfis.some(
            (p) =>
              p.perfilId === s.profileReference &&
              p.versao === s.policyVersion &&
              p.cobrir === s.coverageEnabled,
          ),
        ),
      "CONFLITO",
      "Confira o pedido já registrado antes de escolher outra troca.",
    );
    await atual.nativa.conferirPrazo(autor.login);
    return { tipo: "recibo", recibo: reciboDaTroca(existente) } as const;
  }
  const { contrato, assinatura } = await lerContratoParaTrocaLocked(tx, {
    grupoId: pedido.grupoId,
    paganteId: autor.contaId,
    modo: runtime.modo,
    revisao: pedido.revisaoContrato,
    agora,
  });
  const troca = classificarTrocaDePlano(contrato.currentProductId, pedido.produtoDestino);
  assertAllowed(troca.tipo === "upgrade", "OFERTA", "Confira a vigência da troca escolhida.");
  const origem = runtime.produtos.find(
    (p) => p.id === contrato.currentProductId && p.app === "recreio",
  );
  const destino = runtime.produtos.find(
    (p) => p.id === pedido.produtoDestino && p.app === "recreio",
  );
  const precoDestino = destino?.stripePriceId[runtime.modo];
  assertAllowed(
    origem?.stripePriceId[runtime.modo] === contrato.currentPriceId &&
      destino?.kind === "subscription" &&
      destino.interval === troca.destino.interval &&
      destino.tier === troca.destino.tier &&
      destino.listPrice?.amountCents === troca.destino.amountCents &&
      destino.listPrice.currency === "BRL" &&
      precoDestino &&
      isStripePriceIdConfigured(precoDestino),
    "OFERTA",
    "A oferta atual exige conferência.",
  );
  const selecao = pedido.perfis.map((p) => ({
    profileReference: p.perfilId,
    profileId: p.perfilId,
    groupId: pedido.grupoId,
    policyVersion: p.versao,
    coverageEnabled: p.cobrir,
  }));
  conferirSelecaoDaTroca(
    pedido.grupoId,
    pedido.produtoDestino,
    selecao,
    perfisParaSelecionarNaTroca(atual.perfis, atual.vinculos),
  );
  const [pendente] = await tx
    .select()
    .from(changes)
    .where(and(eq(changes.subscriptionId, assinatura.id), isNull(changes.resolvedAt)))
    .for("update");
  assertAllowed(
    !pendente || (pendente.requestStartedAt === null && pendente.quoteExpiresAt <= agora),
    "TROCA_PENDENTE",
    "Confira ou encerre a troca anterior antes de preparar outra.",
  );
  const remota = await lerOrigemDaAssinaturaParaTroca(tx, assinatura.id, autor.contaId);
  assertAllowed(remota, "ORIGEM_FINANCEIRA", "A origem do contrato exige conferência.");
  const proporcional = prorationAt ?? new Date(Math.floor(agora.getTime() / 1000) * 1000);
  assertAllowed(
    proporcional >= assinatura.inicioDoPeriodo && proporcional < assinatura.fimDoPeriodo,
    "CONFLITO",
    "O período mudou. Confira a troca novamente.",
  );
  const scope: RecreioUpgradeScope = {
    intentId: pedido.pedidoId,
    customerId: remota.providerCustomerId,
    subscriptionId: remota.providerSubscriptionId,
    fromPriceId: contrato.currentPriceId,
    toPriceId: precoDestino,
    periodStart: assinatura.inicioDoPeriodo,
    periodEnd: assinatura.fimDoPeriodo,
    prorationAt: proporcional,
    origin: {
      authorizationId: contrato.purchaseId,
      productId: contrato.originProductId,
      payerId: autor.contaId,
    },
  };
  const termos = {
    subscriptionId: assinatura.id,
    purchaseId: contrato.purchaseId,
    groupId: pedido.grupoId,
    payerUserId: autor.contaId,
    providerMode: runtime.modo,
    originProductId: contrato.originProductId,
    expectedContractRevision: contrato.revision,
    fromProductId: contrato.currentProductId,
    fromPriceId: contrato.currentPriceId,
    toProductId: pedido.produtoDestino,
    toPriceId: precoDestino,
    toAmountCents: troca.destino.amountCents,
    toInterval: troca.destino.interval,
    periodStart: assinatura.inicioDoPeriodo,
    periodEnd: assinatura.fimDoPeriodo,
  };
  const final = await atual.nativa.conferirPrazo(autor.login);
  assertAllowed(
    limiteFinanceiroDaAssinatura(assinatura, final),
    "CONFLITO",
    "Confira novamente o pagamento do contrato.",
  );
  return { tipo: "preparada", scope, termos, selecao, pendente, agora, assinatura } as const;
}

/** Two native admissions around provider preview. No line/identity transaction
 * spans network I/O; no placeholder quote/acceptance is invented on a lost preview. */
export function prepararCotacaoDeAumentoNoBanco(
  autor: AutorNativoRecente,
  pedido: PrepararTroca,
  runtime: RuntimeDaCotacaoDeAumento,
) {
  return comCicloDeCobranca(autor.contaId, async () => {
    const preparada = await db.transaction((tx) => carregar(tx, autor, pedido, runtime));
    if (preparada.tipo === "recibo") return preparada.recibo;
    const budget = { deadlineMs: Date.now() + 90_000 };
    await runtime.conferirCatalogo(budget);
    const cotacao = await runtime.aumentos.preview({ ...preparada.scope, budget });
    return db.transaction(async (tx) => {
      const atual = await carregar(tx, autor, pedido, runtime, preparada.scope.prorationAt);
      if (atual.tipo === "recibo") return atual.recibo;
      assertAllowed(
        JSON.stringify([atual.scope, atual.termos, atual.selecao]) ===
          JSON.stringify([preparada.scope, preparada.termos, preparada.selecao]) &&
          atual.agora < new Date(preparada.agora.getTime() + PRAZO_DA_COTACAO_MS),
        "CONFLITO",
        "O contrato ou a seleção mudou durante a cotação. Confira novamente.",
      );
      if (atual.pendente) {
        await tx
          .update(changes)
          .set({ status: "failed", resolvedAt: atual.agora, reviewRequired: false })
          .where(eq(changes.id, atual.pendente.id));
        await logAuditEventStrict(
          "recreio.plan_change_closed",
          autor.contaId,
          {
            app: "recreio",
            groupId: pedido.grupoId,
            planChangeId: atual.pendente.id,
            state: "expired_before_attempt",
          },
          { writer: tx },
        );
      }
      const [linha] = await tx
        .insert(changes)
        .values({
          ...atual.termos,
          id: pedido.pedidoId,
          kind: "upgrade",
          effectiveAt: preparada.scope.prorationAt,
          prorationAt: preparada.scope.prorationAt,
          providerItemId: cotacao.itemId,
          quotedAmountCents: cotacao.amountDueCents,
          quotedSubtotalCents: cotacao.subtotalCents,
          quotedCreditCents: cotacao.creditCents,
          quotedTotalCents: cotacao.totalCents,
          quotedStartingBalanceCents: cotacao.startingBalanceCents,
          currency: cotacao.currency,
          policyVersion: VERSAO_DA_TROCA,
          quotedAt: preparada.agora,
          quoteExpiresAt: new Date(preparada.agora.getTime() + PRAZO_DA_COTACAO_MS),
          status: "quoted",
        })
        .returning();
      assertAllowed(linha, "COBRANCA", "Não foi possível registrar a cotação.");
      if (atual.selecao.length)
        await tx
          .insert(selections)
          .values(atual.selecao.map((s) => ({ ...s, planChangeId: linha.id })));
      await logAuditEventStrict(
        "recreio.plan_change_quoted",
        autor.contaId,
        {
          app: "recreio",
          groupId: pedido.grupoId,
          planChangeId: linha.id,
          subscriptionId: linha.subscriptionId,
          revision: linha.expectedContractRevision,
          state: "quoted",
        },
        { writer: tx },
      );
      const autoridade = await admitirGrupoDoTitular(tx, autor, pedido.grupoId, "update");
      const final = await autoridade.nativa.conferirPrazo(autor.login);
      assertAllowed(
        final < linha.quoteExpiresAt && limiteFinanceiroDaAssinatura(atual.assinatura, final),
        "CONFLITO",
        "Confira novamente o contrato e a cotação.",
      );
      return reciboDaTroca(linha);
    });
  });
}
