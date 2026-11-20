import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import {
  readPersonalRecreioPaymentPeriods,
  readPersonalRecreioSubscriptions,
} from "@informach/billing/recreio-personal-records";
import { and, eq, gt, or, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioPlanChanges as changes,
  recreioTrialClaims as claims,
  recreioAccountClosureFinances as closureFinances,
  recreioAdultDeclarations as declarations,
  recreioDeviceSessions as devices,
  recreioGroupInvites as invites,
  recreioRightsOperations as operations,
  recreioNativePins as pins,
  recreioRightsPreparations as preparations,
  recreioPurchaseAuthorizations as purchases,
  recreioTrialEnrollments as trials,
} from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { lerParticipacaoDoRecreioLocked } from "@/features/account/participacao-repository";
import { assertAllowed } from "@/lib/errors";
import { comContaPessoal } from "./autoridade-repository";
import { criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";
import { copiarSegurancaPessoalNaTransacao } from "./captura-seguranca-repository";

/** Projeções da própria conta/pagante no Recreio. A mesma pessoa em outro
 * aplicativo não amplia o escopo; pertencer à família não concede faturas
 * alheias. Sem dados dos perfis, credenciais ou metadados livres do provedor. */
export async function capturarDadosPessoaisDaConta(autor: AutorNativoRecente) {
  const arquivo = criarArquivoPessoal();
  try {
    const captura = await comContaPessoal(
      autor,
      async (tx, conta, prazo) => {
        const capturadaEm = (await prazo()).toISOString();
        arquivo.adicionar("manifesto", {
          formato: "recreio-copia-pessoal-conta-v1",
          capturadaEm,
          secoes: [
            "identificacao",
            "participacao_recreio",
            "protecao_conta",
            "declaracao",
            "aparelho",
            "convite_comercial",
            "aceite_teste",
            "teste_utilizado",
            "aceite_compra",
            "troca_plano",
            "cancelamento_renovacao",
            "encerramento_financeiro",
            "assinatura",
            "periodo_financeiro",
            "previa_direitos",
            "pedido_direitos",
            "denuncia_propria",
            "recurso_restricao",
          ],
          dadosDePerfisIncluidos: false,
          conteudoCompartilhadoIncluido: false,
          dadosDeOutrosAplicativosIncluidos: false,
        });
        arquivo.adicionar("identificacao", {
          contaId: conta.id,
          nome: conta.name,
          emailDeLogin: conta.email,
          criadaEm: conta.createdAt,
        });
        const participacao = await lerParticipacaoDoRecreioLocked(tx, conta.id);
        arquivo.adicionar("participacao_recreio", participacao);
        const [pin] = await tx
          .select({
            definido: sql<boolean>`${pins.hash} is not null`,
            atualizadoEm: pins.updatedAt,
          })
          .from(pins)
          .where(eq(pins.userId, autor.contaId));
        arquivo.adicionar("protecao_conta", pin ?? { definido: false, atualizadoEm: null });
        async function paginas<T extends { cursor: string }>(
          tipo: string,
          buscar: (apos: string | null) => Promise<T[]>,
        ) {
          let apos: string | null = null;
          while (true) {
            const linhas = await buscar(apos);
            for (const { cursor, ...dados } of linhas) {
              assertAllowed(
                apos === null || cursor > apos,
                "INTEGRIDADE",
                "Não foi possível preparar a cópia.",
              );
              arquivo.adicionar(tipo, dados);
              apos = cursor;
            }
            await prazo();
            if (linhas.length < limites.pagina) return;
          }
        }
        await paginas("declaracao", (apos) =>
          tx
            .select({
              cursor: declarations.id,
              versao: declarations.version,
              registradaEm: declarations.createdAt,
            })
            .from(declarations)
            .where(
              and(
                eq(declarations.userId, autor.contaId),
                apos ? gt(declarations.id, apos) : undefined,
              ),
            )
            .orderBy(declarations.id)
            .limit(limites.pagina),
        );
        await paginas("encerramento_financeiro", (apos) =>
          tx
            .select({
              cursor: closureFinances.operationId,
              condicoes: closureFinances.policyVersion,
              estado: closureFinances.state,
              criadaEm: closureFinances.createdAt,
              tentativaEm: closureFinances.requestStartedAt,
              observadoEm: closureFinances.observedAt,
              confirmadoEm: closureFinances.confirmedAt,
              resultado: closureFinances.result,
            })
            .from(closureFinances)
            .where(
              and(
                eq(closureFinances.requesterUserId, autor.contaId),
                apos ? gt(closureFinances.operationId, apos) : undefined,
              ),
            )
            .orderBy(closureFinances.operationId)
            .limit(limites.pagina),
        );
        await paginas("cancelamento_renovacao", (apos) =>
          tx
            .select({
              cursor: cancellations.id,
              produtoApresentado: cancellations.expectedProductId,
              condicoes: cancellations.policyVersion,
              origem: cancellations.initiator,
              estado: cancellations.state,
              aceitoEm: cancellations.acceptedAt,
              tentativaEm: cancellations.requestStartedAt,
              confirmadoEm: cancellations.confirmedAt,
              periodoApresentadoAte: cancellations.expectedPeriodEnd,
              resultado: cancellations.providerResult,
              renovacaoInterrompidaEm: cancellations.providerStopAt,
            })
            .from(cancellations)
            .where(
              and(
                eq(cancellations.payerUserId, autor.contaId),
                apos ? gt(cancellations.id, apos) : undefined,
              ),
            )
            .orderBy(cancellations.id)
            .limit(limites.pagina),
        );
        // O cursor UUID não entra no arquivo: aparelho/login continuam privados.
        await paginas("aparelho", (apos) =>
          tx
            .select({
              cursor: devices.id,
              tipo: devices.kind,
              criadoEm: devices.createdAt,
              vistoEm: devices.lastSeenAt,
              expiraEm: devices.expiresAt,
              revogadoEm: devices.revokedAt,
            })
            .from(devices)
            .where(and(eq(devices.userId, autor.contaId), apos ? gt(devices.id, apos) : undefined))
            .orderBy(devices.id)
            .limit(limites.pagina),
        );
        await paginas("convite_comercial", (apos) =>
          tx
            .select({
              cursor: invites.id,
              enviadoPorMim: sql<boolean>`${invites.inviterUserId}=${autor.contaId}`,
              estado: invites.state,
              criadoEm: invites.createdAt,
              expiraEm: invites.expiresAt,
              encerradoEm: invites.finishedAt,
            })
            .from(invites)
            .where(
              and(
                or(
                  eq(invites.inviterUserId, autor.contaId),
                  eq(invites.recipientUserId, autor.contaId),
                  eq(invites.acceptedUserId, autor.contaId),
                ),
                apos ? gt(invites.id, apos) : undefined,
              ),
            )
            .orderBy(invites.id)
            .limit(limites.pagina),
        );
        await paginas("aceite_teste", (apos) =>
          tx
            .select({
              cursor: trials.id,
              politica: trials.policyVersion,
              declaracao: trials.adultDeclarationVersion,
              aceitoEm: trials.acceptedAt,
              retiradoEm: trials.withdrawnAt,
            })
            .from(trials)
            .where(
              and(eq(trials.payerUserId, autor.contaId), apos ? gt(trials.id, apos) : undefined),
            )
            .orderBy(trials.id)
            .limit(limites.pagina),
        );
        const [teste] = await tx
          .select({
            coorte: claims.cohort,
            politica: claims.policyVersion,
            inicioEm: claims.startsAt,
            fimEm: claims.endsAt,
          })
          .from(claims)
          .where(eq(claims.payerUserId, autor.contaId));
        if (teste) arquivo.adicionar("teste_utilizado", teste);
        await paginas("aceite_compra", (apos) =>
          tx
            .select({
              cursor: purchases.id,
              produto: purchases.productId,
              plano: purchases.tier,
              intervalo: purchases.interval,
              valorCentavos: purchases.amountCents,
              moeda: purchases.currency,
              modo: purchases.providerMode,
              politica: purchases.policyVersion,
              declaracao: purchases.adultDeclarationVersion,
              aceitoEm: purchases.acceptedAt,
              envioIniciadoEm: purchases.requestStartedAt,
              resolvidoEm: purchases.resolvedAt,
              resolucao: purchases.resolution,
              precisaConferencia: purchases.reviewRequired,
            })
            .from(purchases)
            .where(
              and(
                eq(purchases.payerUserId, autor.contaId),
                apos ? gt(purchases.id, apos) : undefined,
              ),
            )
            .orderBy(purchases.id)
            .limit(limites.pagina),
        );
        await paginas("troca_plano", (apos) =>
          tx
            .select({
              cursor: changes.id,
              produtoAnterior: changes.fromProductId,
              produtoNovo: changes.toProductId,
              tipo: changes.kind,
              estado: changes.status,
              valorRecorrenteCentavos: changes.toAmountCents,
              valorCotadoCentavos: changes.quotedTotalCents,
              moeda: changes.currency,
              modo: changes.providerMode,
              cotadaEm: changes.quotedAt,
              aceitaEm: changes.acceptedAt,
              vigenciaEm: changes.effectiveAt,
              aplicadaEm: changes.appliedAt,
              cancelamentoPedidoEm: changes.cancelRequestedAt,
              resolvidaEm: changes.resolvedAt,
              precisaConferencia: changes.reviewRequired,
            })
            .from(changes)
            .where(
              and(eq(changes.payerUserId, autor.contaId), apos ? gt(changes.id, apos) : undefined),
            )
            .orderBy(changes.id)
            .limit(limites.pagina),
        );
        await paginas("assinatura", (apos) =>
          readPersonalRecreioSubscriptions(tx, autor.contaId, apos, limites.pagina),
        );
        await paginas("periodo_financeiro", (apos) =>
          readPersonalRecreioPaymentPeriods(tx, autor.contaId, apos, limites.pagina),
        );
        await paginas("previa_direitos", (apos) =>
          tx
            .select({
              cursor: preparations.id,
              tipo: preparations.kind,
              criadaEm: preparations.createdAt,
              expiraEm: preparations.expiresAt,
              canceladaEm: preparations.cancelledAt,
            })
            .from(preparations)
            .where(
              and(
                eq(preparations.requesterUserId, autor.contaId),
                apos ? gt(preparations.id, apos) : undefined,
              ),
            )
            .orderBy(preparations.id)
            .limit(limites.pagina),
        );
        await paginas("pedido_direitos", (apos) =>
          tx
            .select({
              cursor: operations.id,
              tipo: operations.kind,
              estado: operations.state,
              consentidoEm: operations.consentedAt,
              admitidoEm: operations.admittedAt,
              concluidoEm: operations.completedAt,
            })
            .from(operations)
            .where(
              and(
                eq(operations.requesterUserId, autor.contaId),
                apos ? gt(operations.id, apos) : undefined,
              ),
            )
            .orderBy(operations.id)
            .limit(limites.pagina),
        );
        await copiarSegurancaPessoalNaTransacao(
          tx,
          { contaId: autor.contaId, perfilId: null },
          arquivo,
          prazo,
        );
        await logAuditEventStrict(
          "recreio.account_personal_capture_prepared",
          autor.contaId,
          { app: "recreio" },
          { writer: tx },
        );
        await prazo();
        return {
          escopo: "account" as const,
          capturadaEm,
          revisaoDaParticipacao: participacao.revisao,
        };
      },
      true,
    );
    return { ...captura, bytes: arquivo.concluir() };
  } finally {
    arquivo.encerrar();
  }
}
