import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type { Product, StripeMode } from "@informach/config";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limiteFinanceiroDaAssinatura } from "@/features/acesso/decisao";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { comCicloDeCobranca } from "./lifecycle";
import { lerContratoParaTrocaLocked } from "./troca-contexto-repository";
import { reciboDaTroca } from "./troca-cotacao-repository";
import { type AceitarTroca, conferirAceiteDaTroca } from "./troca-entrada";
import { classificarTrocaDePlano } from "./troca-regras";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
async function pista(autor: AutorNativoRecente, id: string, modo: StripeMode) {
  const [pista] = await db
    .select({ grupoId: changes.groupId })
    .from(changes)
    .where(
      and(
        eq(changes.id, id),
        eq(changes.payerUserId, autor.contaId),
        eq(changes.providerMode, modo),
      ),
    );
  assertAllowed(pista, "COBRANCA", "Cotação não disponível.");
  return GrupoIdSchema.parse(pista.grupoId);
}

/** Records consent only; execution must admit another durable attempt first. */
export function aceitarTrocaNoBanco(
  autor: AutorNativoRecente,
  pedido: AceitarTroca,
  catalogo: { modo: StripeMode; produtos: readonly Product[] },
) {
  return comCicloDeCobranca(autor.contaId, async () => {
    const grupoId = await pista(autor, pedido.pedidoId, catalogo.modo);
    return db.transaction(async (tx) => {
      await limites(tx);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update");
      const agora = await atual.nativa.conferirPrazo(autor.login);
      const [linha] = await tx
        .select()
        .from(changes)
        .where(
          and(
            eq(changes.id, pedido.pedidoId),
            eq(changes.groupId, grupoId),
            eq(changes.payerUserId, autor.contaId),
            eq(changes.providerMode, catalogo.modo),
          ),
        )
        .for("update");
      assertAllowed(linha, "COBRANCA", "Cotação não disponível.");
      conferirAceiteDaTroca(pedido, linha, agora);
      if (linha.acceptedAt !== null) {
        await atual.nativa.conferirPrazo(autor.login);
        return reciboDaTroca(linha);
      }
      assertAllowed(
        linha.status === "quoted" &&
          linha.resolvedAt === null &&
          linha.requestStartedAt === null &&
          !linha.reviewRequired,
        "CONFLITO",
        "Confira o estado da cotação antes de continuar.",
      );
      assertAllowed(
        classificarTrocaDePlano(linha.fromProductId, linha.toProductId).tipo === linha.kind,
        "CONFLITO",
        "A vigência da troca exige nova conferência.",
      );
      const { contrato, assinatura } = await lerContratoParaTrocaLocked(tx, {
        grupoId,
        paganteId: autor.contaId,
        modo: catalogo.modo,
        revisao: linha.expectedContractRevision,
        agora,
      });
      assertAllowed(
        contrato.subscriptionId === linha.subscriptionId &&
          contrato.purchaseId === linha.purchaseId &&
          contrato.currentProductId === linha.fromProductId &&
          contrato.currentPriceId === linha.fromPriceId &&
          assinatura.inicioDoPeriodo.getTime() === linha.periodStart.getTime() &&
          assinatura.fimDoPeriodo.getTime() === linha.periodEnd.getTime(),
        "CONFLITO",
        "O período ou a oferta mudou. Confira a cotação novamente.",
      );
      const produto = catalogo.produtos.find(
        (p) => p.app === "recreio" && p.id === linha.toProductId && p.kind === "subscription",
      );
      assertAllowed(
        produto &&
          produto.stripePriceId[catalogo.modo] === linha.toPriceId &&
          produto.interval === linha.toInterval &&
          produto.listPrice?.amountCents === linha.toAmountCents &&
          produto.listPrice.currency === linha.currency,
        "OFERTA",
        "Confira a oferta atual antes de aceitar.",
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
      const [aceita] = await tx
        .update(changes)
        .set({ status: "accepted", acceptedAt: agora })
        .where(eq(changes.id, linha.id))
        .returning();
      assertAllowed(aceita, "COBRANCA", "Não foi possível registrar o aceite.");
      await logAuditEventStrict(
        "recreio.plan_change_accepted",
        autor.contaId,
        {
          app: "recreio",
          groupId: grupoId,
          planChangeId: linha.id,
          subscriptionId: linha.subscriptionId,
          revision: linha.expectedContractRevision,
          state: "accepted",
        },
        { writer: tx },
      );
      const final = await atual.nativa.conferirPrazo(autor.login);
      conferirAceiteDaTroca(pedido, linha, final);
      assertAllowed(
        limiteFinanceiroDaAssinatura(assinatura, final),
        "PLANO",
        "O pagamento exige nova conferência.",
      );
      return reciboDaTroca(aceita);
    });
  });
}

/** Only a quote/acceptance with no admitted external attempt can close here.
 * Neither missing provider IDs nor an expired quote prove an operation absent. */
export function encerrarTrocaNaoEnviadaNoBanco(
  autor: AutorNativoRecente,
  id: string,
  modo: StripeMode,
) {
  return comCicloDeCobranca(autor.contaId, async () => {
    const grupoId = await pista(autor, id, modo);
    return db.transaction(async (tx) => {
      await limites(tx);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update", "financeiro");
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
      assertAllowed(linha, "COBRANCA", "Cotação não disponível.");
      if (linha.resolvedAt !== null) {
        await atual.nativa.conferirPrazo(autor.login);
        return reciboDaTroca(linha);
      }
      assertAllowed(
        linha.requestStartedAt === null &&
          linha.providerScheduleId === null &&
          linha.providerInvoiceId === null,
        "OPERACAO_EM_CONFERENCIA",
        "Esta operação foi enviada. O cancelamento exige confirmação do provedor.",
      );
      const [encerrada] = await tx
        .update(changes)
        .set({ status: "canceled", resolvedAt: agora, reviewRequired: false })
        .where(eq(changes.id, id))
        .returning();
      assertAllowed(encerrada, "COBRANCA", "Não foi possível encerrar a cotação.");
      await logAuditEventStrict(
        "recreio.plan_change_closed",
        autor.contaId,
        {
          app: "recreio",
          groupId: grupoId,
          planChangeId: linha.id,
          state: "canceled_before_attempt",
        },
        { writer: tx },
      );
      await atual.nativa.conferirPrazo(autor.login);
      return reciboDaTroca(encerrada);
    });
  });
}
