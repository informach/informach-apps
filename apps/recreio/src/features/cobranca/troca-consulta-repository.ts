import "server-only";
import type { StripeMode } from "@informach/config";
import { and, db, desc, eq, isNull, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioGroups as groups,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import {
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limiteFinanceiroDaAssinatura } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { comCicloDeCobranca } from "./lifecycle";
import { reciboDoCancelamentoDaRenovacao } from "./renovacao-repository";
import { reciboDaTroca } from "./troca-cotacao-repository";

/** Own payer's presentation DTO, never provider IDs or another adult's bill.
 * Reads require current native authority; consent/send recheck recent login. */
export function consultarMinhasTrocasNoBanco(autor: IdentidadeNativa, modo: StripeMode) {
  return comCicloDeCobranca(autor.contaId, () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      const [pista] = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.ownerUserId, autor.contaId));
      if (!pista) {
        const nativa = await autorizarContaNativa(tx, autor, "share", "share", "financeiro");
        await nativa.conferirPrazo();
        return null;
      }
      const grupoId = GrupoIdSchema.parse(pista.id);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share", "financeiro");
      const fatos = await lerFatosDoGrupo(grupoId, tx),
        agora = await atual.nativa.conferirPrazo();
      const assinatura = fatos?.assinaturaAtiva ?? fatos?.assinaturaInativa;
      const [contrato] = assinatura
        ? await tx
            .select()
            .from(contracts)
            .where(
              and(
                eq(contracts.subscriptionId, assinatura.id),
                eq(contracts.groupId, grupoId),
                eq(contracts.payerUserId, autor.contaId),
                eq(contracts.providerMode, modo),
              ),
            )
        : [];
      const escopo = and(
        eq(changes.groupId, grupoId),
        eq(changes.payerUserId, autor.contaId),
        eq(changes.providerMode, modo),
      );
      const [cancelamento] = contrato
        ? await tx
            .select()
            .from(cancellations)
            .where(
              and(
                eq(cancellations.subscriptionId, contrato.subscriptionId),
                eq(cancellations.payerUserId, autor.contaId),
                eq(cancellations.providerMode, modo),
              ),
            )
        : [];
      const pendentes = await tx
        .select()
        .from(changes)
        .where(and(escopo, isNull(changes.resolvedAt)))
        .limit(2);
      assertAllowed(
        pendentes.length <= 1,
        "COBRANCA_EM_CONFERENCIA",
        "Há pedidos de troca que exigem conferência.",
      );
      const [ultima] = pendentes.length
        ? pendentes
        : await tx
            .select()
            .from(changes)
            .where(escopo)
            .orderBy(desc(changes.quotedAt), desc(changes.id))
            .limit(1);
      const perfis = ultima
        ? await tx
            .select({
              perfilId: selections.profileReference,
              versao: selections.policyVersion,
              cobrir: selections.coverageEnabled,
            })
            .from(selections)
            .where(eq(selections.planChangeId, ultima.id))
            .orderBy(selections.profileReference)
        : [];
      await atual.nativa.conferirPrazo();
      return {
        grupoId,
        contrato: contrato
          ? {
              assinaturaId: contrato.subscriptionId,
              produtoId: contrato.currentProductId,
              revisao: contrato.revision,
              podePreparar: Boolean(
                assinatura &&
                  !cancelamento &&
                  assinatura.cancelaEm === null &&
                  !contrato.coverageReviewRequired &&
                  contrato.currentProductId === assinatura.productId &&
                  contrato.currentPriceId === assinatura.financeiro.precoId &&
                  limiteFinanceiroDaAssinatura(assinatura, agora),
              ),
            }
          : null,
        pedido: ultima ? { ...reciboDaTroca(ultima), perfis } : null,
        cancelamentoDaRenovacao: cancelamento
          ? reciboDoCancelamentoDaRenovacao(cancelamento)
          : null,
        conferidoEm: agora.toISOString(),
      };
    }),
  );
}
