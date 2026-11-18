import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limiteFinanceiroDaAssinatura } from "@/features/acesso/decisao";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { comCicloDeCobranca } from "./lifecycle";
import { lerContratoParaTrocaLocked } from "./troca-contexto-repository";
import { PRAZO_DA_COTACAO_MS, type PrepararTroca, VERSAO_DA_TROCA } from "./troca-entrada";
import { classificarTrocaDePlano } from "./troca-regras";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

export function reciboDaTroca(linha: typeof changes.$inferSelect) {
  return {
    id: linha.id,
    grupoId: linha.groupId,
    produtoAtual: linha.fromProductId,
    produtoDestino: linha.toProductId,
    revisaoContrato: linha.expectedContractRevision,
    tipo: linha.kind,
    valorAgoraCentavos: linha.quotedAmountCents,
    subtotalCentavos: linha.quotedSubtotalCents,
    creditoCentavos: linha.quotedCreditCents,
    totalCentavos: linha.quotedTotalCents,
    valorRenovacaoCentavos: linha.toAmountCents,
    intervalo: linha.toInterval,
    moeda: linha.currency,
    vigencia: linha.effectiveAt.toISOString(),
    cotadaEm: linha.quotedAt.toISOString(),
    aceitarAte: linha.quoteExpiresAt.toISOString(),
    aceitoEm: linha.acceptedAt?.toISOString() ?? null,
    tentativaEm: linha.requestStartedAt?.toISOString() ?? null,
    cancelamentoPedidoEm: linha.cancelRequestedAt?.toISOString() ?? null,
    resolvidoEm: linha.resolvedAt?.toISOString() ?? null,
    estado: linha.status,
    emConferencia: linha.reviewRequired,
    versaoDasCondicoes: linha.policyVersion,
  };
}

/** Reduction quote only: no network, acceptance, plan application or new access. */
export function prepararCotacaoDeReducaoNoBanco(
  autor: AutorNativoRecente,
  pedido: PrepararTroca,
  catalogo: { modo: StripeMode; produtos: readonly Product[] },
) {
  return comCicloDeCobranca(autor.contaId, () =>
    db.transaction(async (tx) => {
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
            eq(changes.providerMode, catalogo.modo),
          ),
        )
        .for("update");
      if (existente) {
        const escolhidos = await tx
          .select()
          .from(selections)
          .where(eq(selections.planChangeId, existente.id));
        assertAllowed(
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
        return reciboDaTroca(existente);
      }
      const { contrato, assinatura } = await lerContratoParaTrocaLocked(tx, {
        grupoId: pedido.grupoId,
        paganteId: autor.contaId,
        modo: catalogo.modo,
        revisao: pedido.revisaoContrato,
        agora,
      });
      const troca = classificarTrocaDePlano(contrato.currentProductId, pedido.produtoDestino);
      assertAllowed(
        troca.tipo === "downgrade",
        "INDISPONIVEL",
        "A cotação de aumento ainda está em homologação.",
      );
      const origem = catalogo.produtos.find(
        (p) => p.id === contrato.currentProductId && p.app === "recreio",
      );
      const destino = catalogo.produtos.find(
        (p) => p.id === pedido.produtoDestino && p.app === "recreio",
      );
      const precoDestino = destino?.stripePriceId[catalogo.modo];
      assertAllowed(
        origem?.stripePriceId[catalogo.modo] === contrato.currentPriceId &&
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
      if (pendente) {
        assertAllowed(
          pendente.requestStartedAt === null && pendente.quoteExpiresAt <= agora,
          "TROCA_PENDENTE",
          "Confira ou encerre a troca anterior antes de preparar outra.",
        );
        await tx
          .update(changes)
          .set({ status: "failed", resolvedAt: agora, reviewRequired: false })
          .where(eq(changes.id, pendente.id));
        await logAuditEventStrict(
          "recreio.plan_change_closed",
          autor.contaId,
          {
            app: "recreio",
            groupId: pedido.grupoId,
            planChangeId: pendente.id,
            state: "expired_before_attempt",
          },
          { writer: tx },
        );
      }
      const [linha] = await tx
        .insert(changes)
        .values({
          id: pedido.pedidoId,
          subscriptionId: assinatura.id,
          purchaseId: contrato.purchaseId,
          groupId: pedido.grupoId,
          payerUserId: autor.contaId,
          providerMode: catalogo.modo,
          originProductId: contrato.originProductId,
          expectedContractRevision: contrato.revision,
          fromProductId: contrato.currentProductId,
          fromPriceId: contrato.currentPriceId,
          toProductId: pedido.produtoDestino,
          toPriceId: precoDestino,
          toAmountCents: troca.destino.amountCents,
          toInterval: troca.destino.interval,
          kind: "downgrade",
          periodStart: assinatura.inicioDoPeriodo,
          periodEnd: assinatura.fimDoPeriodo,
          effectiveAt: assinatura.fimDoPeriodo,
          quotedAmountCents: 0,
          quotedSubtotalCents: 0,
          quotedCreditCents: 0,
          quotedTotalCents: 0,
          currency: "BRL",
          policyVersion: VERSAO_DA_TROCA,
          quotedAt: agora,
          quoteExpiresAt: new Date(agora.getTime() + PRAZO_DA_COTACAO_MS),
          status: "quoted",
        })
        .returning();
      assertAllowed(linha, "COBRANCA", "Não foi possível registrar a cotação.");
      if (selecao.length)
        await tx.insert(selections).values(selecao.map((s) => ({ ...s, planChangeId: linha.id })));
      await logAuditEventStrict(
        "recreio.plan_change_quoted",
        autor.contaId,
        {
          app: "recreio",
          groupId: pedido.grupoId,
          planChangeId: linha.id,
          subscriptionId: assinatura.id,
          revision: contrato.revision,
          state: "quoted",
        },
        { writer: tx },
      );
      const final = await atual.nativa.conferirPrazo(autor.login);
      assertAllowed(
        final < linha.quoteExpiresAt && limiteFinanceiroDaAssinatura(assinatura, final),
        "CONFLITO",
        "Confira novamente o contrato e a cotação.",
      );
      return reciboDaTroca(linha);
    }),
  );
}
