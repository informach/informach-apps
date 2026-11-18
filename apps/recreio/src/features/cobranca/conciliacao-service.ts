import "server-only";
import { PaymentEvidenceMismatchError } from "@informach/billing";
import { isStripePriceIdConfigured, type StripeMode } from "@informach/config";
import { z } from "zod";
import { AppError, assertAllowed } from "@/lib/errors";
import {
  confirmarConciliacaoLocked,
  iniciarConciliacaoLocked,
  type MotivoDaConferencia,
  registrarFalhaDaConciliacaoLocked,
  reservarProximaConciliacao,
  type TentativaDeConciliacao,
} from "./conciliacao-fila-repository";
import {
  lerOrigensDaConciliacao,
  persistirFatosDaConciliacao,
  type VinculoDoCheckout,
} from "./conciliacao-origens-repository";
import type { RuntimeDeConciliacao } from "./conciliacao-runtime";
import { prepararPeriodosDoFinanciamento } from "./financiamento-periodos";
import { FinanciamentoInconclusivo } from "./financiamento-regras";
import { comCicloDeCobranca } from "./lifecycle";
import {
  type AumentoObservado,
  lerAumentoDaConciliacaoLocked,
} from "./troca-aumento-execucao-repository";
import { recuperarAumentoAdmitido } from "./troca-aumento-recuperacao-service";
import {
  type AgendaDaTrocaObservada,
  lerTrocaDaConciliacaoLocked,
} from "./troca-execucao-repository";
import { recuperarAgendaAdmitida } from "./troca-recuperacao-service";

function motivoDaFalha(erro: unknown): MotivoDaConferencia {
  if (erro instanceof PaymentEvidenceMismatchError) return "evidence_mismatch";
  if (erro instanceof FinanciamentoInconclusivo)
    return erro.motivo === "origem_comercial_de_outro_pagante"
      ? "foreign_contract"
      : "evidence_mismatch";
  if (erro instanceof AppError && erro.code === "CLIENTE_FINANCEIRO") return "customer_unconfirmed";
  if (erro instanceof AppError && erro.code === "ORIGEM_FINANCEIRA") return "foreign_contract";
  return "provider_unavailable";
}

/** A technical worker, not a browser admission. Native attempts alone can
 * authorize scoped schedule recovery; financial reads never authorize a POST.
 * Each payer keeps its lifecycle across I/O, outside database transactions.
 */
export function criarProcessadorDeConciliacao(deps: {
  modo: StripeMode;
  obterRuntime: () => RuntimeDeConciliacao;
  relatarFalha: (entrada: {
    payerId: string;
    reasonCode: MotivoDaConferencia | "technical_failure";
  }) => void;
}) {
  return async () => {
    const relatar: typeof deps.relatarFalha = (entrada) => {
      try {
        deps.relatarFalha(entrada);
      } catch {
        /* The durable failure remains in the queue even if telemetry fails. */
      }
    };
    const resultado = { reservadas: 0, conciliadas: 0, emConferencia: 0, falhasTecnicas: 0 };
    const inicio = Date.now();
    let runtime: RuntimeDeConciliacao | undefined, catalogo: Promise<void> | undefined;
    for (let n = 0; n < 8 && Date.now() - inicio < 60_000; n++) {
      const trabalho = await reservarProximaConciliacao(deps.modo);
      if (!trabalho) break;
      resultado.reservadas++;
      try {
        await comCicloDeCobranca(trabalho.payerUserId, async () => {
          let tentativa: TentativaDeConciliacao | undefined;
          try {
            tentativa = await iniciarConciliacaoLocked(trabalho);
            const budget = { deadlineMs: Date.now() + 90_000 };
            const conferirPrazo = () =>
              assertAllowed(
                Date.now() < budget.deadlineMs,
                "COBRANCA",
                "A leitura financeira excedeu o prazo de conferência.",
              );
            assertAllowed(
              tentativa.customer,
              "CLIENTE_FINANCEIRO",
              "O cliente financeiro ainda não foi confirmado.",
            );
            runtime ??= deps.obterRuntime();
            assertAllowed(
              runtime.modo === tentativa.providerMode && runtime.modo === deps.modo,
              "ORIGEM_FINANCEIRA",
              "O ambiente financeiro exige conferência.",
            );
            const trocas: AgendaDaTrocaObservada[] = [];
            const aumentos: AumentoObservado[] = [];
            const troca = await lerTrocaDaConciliacaoLocked(tentativa);
            const aumento = await lerAumentoDaConciliacaoLocked(tentativa);
            assertAllowed(
              !troca || !aumento,
              "ORIGEM_FINANCEIRA",
              "Há trocas simultâneas que exigem conferência.",
            );
            if (troca) {
              assertAllowed(
                runtime.agendasAdmitidas,
                "ORIGEM_FINANCEIRA",
                "A recuperação comercial ainda não está configurada.",
              );
              const recuperada = await recuperarAgendaAdmitida(
                troca,
                runtime.agendasAdmitidas,
                budget,
              );
              assertAllowed(
                !recuperada.falhou && recuperada.observacao,
                "COBRANCA",
                "A operação comercial exige conferência.",
              );
              trocas.push(recuperada.observacao);
            }
            if (aumento) {
              assertAllowed(
                runtime.aumentosAdmitidos,
                "ORIGEM_FINANCEIRA",
                "A recuperação do aumento ainda não está configurada.",
              );
              const recuperado = await recuperarAumentoAdmitido(
                aumento,
                runtime.aumentosAdmitidos,
                budget,
              );
              assertAllowed(
                !recuperado.falhou && recuperado.observacao,
                "COBRANCA",
                "O aumento exige conferência.",
              );
              aumentos.push(recuperado.observacao);
            }
            catalogo ??= runtime.conferirCatalogo(budget);
            await catalogo;
            conferirPrazo();
            const aceitos = new Set(
              runtime.produtos
                .filter((p) => p.app === "recreio" && p.kind === "subscription")
                .map((p) => p.stripePriceId[deps.modo]),
            );
            assertAllowed(
              aceitos.size > 0 && [...aceitos].every(isStripePriceIdConfigured),
              "ORIGEM_FINANCEIRA",
              "O catálogo financeiro exige conferência.",
            );
            const ids = await runtime.leitor.listSubscriptionIds(
              tentativa.customer.providerCustomerId,
              budget,
            );
            conferirPrazo();
            assertAllowed(
              ids.length <= 600 && new Set(ids).size === ids.length,
              "ORIGEM_FINANCEIRA",
              "O histórico financeiro exige conferência.",
            );
            const financiamento = await runtime.financiamento.conferirCliente(
              {
                clienteId: tentativa.customer.providerCustomerId,
                paganteId: tentativa.payerUserId,
                assinaturaIds: ids,
                precosAceitos: aceitos,
              },
              budget,
            );
            conferirPrazo();
            const snapshots = prepararPeriodosDoFinanciamento(financiamento, tentativa.startedAt);
            assertAllowed(
              snapshots.filter((s) => s.status !== "canceled" && s.status !== "incomplete_expired")
                .length <= 1,
              "ORIGEM_FINANCEIRA",
              "Há contratos simultâneos que precisam de conferência.",
            );
            const autorizacoes = snapshots.map((s) => {
              const origem = s.origin,
                id = z.uuid().safeParse(origem?.authorizationId);
              assertAllowed(
                origem &&
                  id.success &&
                  origem.subjectType === "user" &&
                  origem.subjectId === trabalho.payerUserId,
                "ORIGEM_FINANCEIRA",
                "A origem do contrato exige conferência.",
              );
              return id.data;
            });
            assertAllowed(
              new Set(autorizacoes).size === autorizacoes.length,
              "ORIGEM_FINANCEIRA",
              "O aceite não pode originar dois contratos.",
            );
            const origens = await lerOrigensDaConciliacao(tentativa, autorizacoes);
            assertAllowed(
              origens.length === autorizacoes.length,
              "ORIGEM_FINANCEIRA",
              "O contrato não tem aceite nativo correspondente.",
            );
            const vinculos: VinculoDoCheckout[] = [];
            for (const snapshot of snapshots) {
              const origem = origens.find((o) => o.id === snapshot.origin?.authorizationId);
              assertAllowed(
                origem && origem.productId === snapshot.origin?.productId,
                "ORIGEM_FINANCEIRA",
                "A oferta contratada exige conferência.",
              );
              if (origem.providerSubscriptionId !== null) {
                assertAllowed(
                  origem.providerSubscriptionId === snapshot.subscriptionId,
                  "ORIGEM_FINANCEIRA",
                  "O vínculo financeiro exige conferência.",
                );
                continue;
              }
              const checkout = await runtime.lerCheckout(
                tentativa.customer.providerCustomerId,
                origem.id,
                origem.providerSessionId,
                budget,
              );
              conferirPrazo();
              assertAllowed(
                checkout?.status === "complete" &&
                  checkout.subscriptionId === snapshot.subscriptionId,
                "ORIGEM_FINANCEIRA",
                "O Checkout não confirma o vínculo do contrato.",
              );
              vinculos.push({
                authorizationId: origem.id,
                sessionId: checkout.id,
                subscriptionId: snapshot.subscriptionId,
              });
            }
            const admitida = tentativa;
            const produtos = runtime.produtos;
            conferirPrazo();
            await confirmarConciliacaoLocked(admitida, async (tx, agora) =>
              persistirFatosDaConciliacao(tx, admitida, {
                snapshots,
                produtos,
                vinculos,
                agora,
                trocas,
                aumentos,
                financiamento,
              }),
            );
            resultado.conciliadas++;
          } catch (erro) {
            if (!tentativa) throw erro;
            const motivo = motivoDaFalha(erro);
            await registrarFalhaDaConciliacaoLocked(tentativa, motivo);
            relatar({ payerId: trabalho.payerUserId, reasonCode: motivo });
            resultado.emConferencia++;
          }
        });
      } catch {
        resultado.falhasTecnicas++;
        relatar({ payerId: trabalho.payerUserId, reasonCode: "technical_failure" });
      }
    }
    return resultado;
  };
}
