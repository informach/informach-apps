import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeRecreioPlanSchedules } from "@informach/billing/providers/stripe-plans";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import type Stripe from "stripe";
import { criarConferenciaDeFinanciamento } from "../src/features/cobranca/financiamento-stripe";
import { classificarTrocaDePlano } from "../src/features/cobranca/troca-regras";

type Oferta = { productId: string; priceId: string; amountCents: number };
class FalhaDaMatriz extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PlanMatrixBoundary";
  }
}
function conferir(valor: unknown, codigo: string): asserts valor {
  if (!valor) throw new FalhaDaMatriz(codigo);
}
const id = (valor: string | { id: string } | null | undefined) =>
  typeof valor === "string" ? valor : valor?.id;
function falha(erro: unknown) {
  return {
    type: erro instanceof Error ? erro.name : "unknown",
    code:
      erro instanceof FalhaDaMatriz
        ? erro.code
        : typeof erro === "object" &&
            erro !== null &&
            "code" in erro &&
            typeof erro.code === "string"
          ? erro.code
          : null,
  };
}

/** Real TEST provider boundary only. No native Checkout/acceptance, webhook
 * delivery or game access is claimed from these deliberately isolated objects. */
export async function conferirMatrizNaApi(config: {
  stripe: Stripe;
  ofertas: readonly Oferta[];
  runId: string;
  prefixo: string;
}) {
  conferir(
    process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      config.runId === process.env.GITHUB_RUN_ID &&
      config.ofertas.length === 4 &&
      new Set(config.ofertas.map((o) => o.productId)).size === 4 &&
      new Set(config.ofertas.map((o) => o.priceId)).size === 4,
    "matrix_executor_scope",
  );
  const stripe = config.stripe,
    prazo = Date.now() + 11 * 60_000;
  function opcoes(limite = prazo, chave?: string): Stripe.RequestOptions {
    const restante = limite - Date.now();
    conferir(restante > 0, "matrix_deadline");
    return {
      timeout: Math.max(1, Math.min(10_000, restante)),
      maxNetworkRetries: 0,
      ...(chave ? { idempotencyKey: chave } : {}),
    };
  }
  const leitor = createStripePaymentFactReader({
    secretKey: "unused",
    client: stripe,
    expectedMode: "dev",
  });
  const financiamento = criarConferenciaDeFinanciamento({ modo: "dev", cliente: stripe, leitor });
  const aceitos = new Set(config.ofertas.map((o) => o.priceId));
  const casos: Record<string, unknown>[] = [];
  let falhou = false;
  for (const origem of config.ofertas)
    for (const destino of config.ofertas) {
      if (origem.productId === destino.productId || falhou) continue;
      const numero = casos.length + 1,
        chave = `${config.prefixo}:matrix:${numero}`;
      const nome = `recreio-matrix-${config.runId}-${process.env.GITHUB_RUN_ATTEMPT}-${numero}`;
      const tipo = classificarTrocaDePlano(origem.productId, destino.productId).tipo;
      const ator = `provider_matrix_${config.runId}_${numero}`,
        autorizacaoId = randomUUID();
      let relogio: Stripe.TestHelpers.TestClock | undefined,
        clienteId: string | undefined,
        assinaturaId: string | undefined,
        agendaId: string | undefined;
      let erro: unknown,
        erroDaLimpeza: unknown,
        limpezaConfirmada = false;
      const instanteInicial = Math.floor(Date.now() / 1000);
      let criacaoDoRelogioTentada = false;
      const prova: Record<string, unknown> = {};
      const marcador = {
        recreio_homologacao_run: config.runId,
        recreio_matrix_case: String(numero),
      };
      const agora = () => {
        conferir(relogio, "matrix_clock_absent");
        return new Date(relogio.frozen_time * 1000);
      };
      async function avancar(alvo: number) {
        conferir(relogio, "matrix_clock_absent");
        while (relogio.frozen_time < alvo) {
          // At most 50 days: below two monthly intervals, even across February.
          const proximo = Math.min(alvo, relogio.frozen_time + 50 * 86400),
            clockId = relogio.id;
          await stripe.testHelpers.testClocks.advance(
            clockId,
            { frozen_time: proximo },
            opcoes(prazo, `${chave}:advance:${proximo}`),
          );
          const limite = Math.min(prazo, Date.now() + 120_000);
          for (;;) {
            relogio = await stripe.testHelpers.testClocks.retrieve(clockId, {}, opcoes(limite));
            if (relogio.status === "ready") break;
            conferir(
              relogio.status === "advancing" && Date.now() < limite,
              "matrix_clock_not_ready",
            );
            await setTimeout(1500);
          }
          conferir(relogio.frozen_time === proximo, "matrix_clock_time_differs");
        }
      }
      try {
        const opcoesDaCriacao = opcoes(prazo, `${chave}:clock`);
        criacaoDoRelogioTentada = true;
        relogio = await stripe.testHelpers.testClocks.create(
          { name: nome, frozen_time: instanteInicial },
          opcoesDaCriacao,
        );
        conferir(!relogio.livemode && relogio.name === nome, "matrix_clock_scope");
        const cliente = await stripe.customers.create(
          { test_clock: relogio.id, metadata: marcador },
          opcoes(prazo, `${chave}:customer`),
        );
        clienteId = cliente.id;
        conferir(
          !cliente.livemode && id(cliente.test_clock) === relogio.id,
          "matrix_customer_scope",
        );
        const pagamento = await stripe.paymentMethods.create(
          { type: "card", card: { token: "tok_visa" } },
          opcoes(prazo, `${chave}:payment`),
        );
        conferir(!pagamento.livemode, "matrix_payment_mode");
        await stripe.paymentMethods.attach(
          pagamento.id,
          { customer: cliente.id },
          opcoes(prazo, `${chave}:attach`),
        );
        await stripe.customers.update(
          cliente.id,
          { invoice_settings: { default_payment_method: pagamento.id } },
          opcoes(prazo, `${chave}:default`),
        );
        const assinatura = await stripe.subscriptions.create(
          {
            customer: cliente.id,
            items: [{ price: origem.priceId, quantity: 1 }],
            payment_behavior: "error_if_incomplete",
            metadata: {
              ...marcador,
              subject_type: "user",
              subject_id: ator,
              checkout_intent_id: autorizacaoId,
              product_id: origem.productId,
            },
          },
          opcoes(prazo, `${chave}:subscription`),
        );
        assinaturaId = assinatura.id;
        const item = assinatura.items.data[0];
        conferir(
          !assinatura.livemode &&
            assinatura.status === "active" &&
            item &&
            assinatura.items.data.length === 1 &&
            item.quantity === 1 &&
            item.price.id === origem.priceId,
          "matrix_initial_subscription",
        );
        const inicial = await leitor.readWithFunding(assinatura.id, aceitos, { deadlineMs: prazo });
        const captura = inicial?.funding.captures[0];
        conferir(
          inicial &&
            inicial.funding.invoices.length === 1 &&
            inicial.funding.captures.length === 1 &&
            captura &&
            captura.amountCapturedCents === origem.amountCents &&
            captura.amountRefundedCents === 0 &&
            !captura.disputed,
          "matrix_initial_capture",
        );
        const contratoOriginal = {
          authorizationId: autorizacaoId,
          productId: origem.productId,
          payerId: ator,
        };
        const estornarOrigem = async () => {
          const estorno = await stripe.refunds.create(
            { charge: captura.id, amount: captura.amountCapturedCents },
            opcoes(prazo, `${chave}:refund`),
          );
          conferir(
            estorno.status === "succeeded" && estorno.amount === captura.amountCapturedCents,
            "matrix_source_refund",
          );
        };
        let faturaDaTroca: string | undefined;
        if (tipo === "upgrade") {
          const aumentos = createStripeRecreioUpgrades({
            secretKey: "unused",
            client: stripe,
            mode: "dev",
            now: agora,
          });
          const escopo = {
            intentId: randomUUID(),
            customerId: cliente.id,
            subscriptionId: assinatura.id,
            fromPriceId: origem.priceId,
            toPriceId: destino.priceId,
            periodStart: new Date(item.current_period_start * 1000),
            periodEnd: new Date(item.current_period_end * 1000),
            prorationAt: agora(),
            origin: contratoOriginal,
            budget: { deadlineMs: prazo },
          };
          const cotacao = await aumentos.preview(escopo);
          const tentativa = {
            ...escopo,
            quote: cotacao,
            requestStartedAt: agora(),
            providerInvoiceId: null,
          };
          const aplicada = await aumentos.apply(tentativa),
            repetida = await aumentos.apply(tentativa);
          conferir(
            aplicada.outcome === "applied" &&
              repetida.outcome === "applied" &&
              aplicada.invoiceId === repetida.invoiceId,
            "matrix_upgrade_replay",
          );
          faturaDaTroca = aplicada.invoiceId;
          prova.quote = {
            subtotal: cotacao.subtotalCents,
            credit: cotacao.creditCents,
            total: cotacao.totalCents,
            due: cotacao.amountDueCents,
            startingBalance: cotacao.startingBalanceCents,
          };
          prova.exactUpgradeReplay = true;
        } else {
          const agendas = createStripeRecreioPlanSchedules({
            secretKey: "unused",
            client: stripe,
            now: agora,
          });
          const entrada = {
            intentId: randomUUID(),
            customerId: cliente.id,
            subscriptionId: assinatura.id,
            fromPriceId: origem.priceId,
            toPriceId: destino.priceId,
            toProductId: destino.productId,
            interval: classificarTrocaDePlano(origem.productId, destino.productId).destino.interval,
            effectiveAt: new Date(item.current_period_end * 1000),
            requestStartedAt: agora(),
            origin: contratoOriginal,
            budget: { deadlineMs: prazo },
          };
          agendaId = await agendas.create(entrada);
          conferir((await agendas.create(entrada)) === agendaId, "matrix_schedule_replay");
          conferir(
            (await agendas.reconcile({ ...entrada, scheduleId: agendaId, cancel: false })) ===
              "scheduled",
            "matrix_schedule_not_configured",
          );
          const antes = await stripe.subscriptions.retrieve(assinatura.id, {}, opcoes());
          conferir(
            antes.items.data[0]?.price.id === origem.priceId,
            "matrix_reduction_applied_early",
          );
          // An adverse old period must not finance the new full-price renewal.
          // Refund while the source charge is current, before advancing years.
          await estornarOrigem();
          await avancar(item.current_period_end + 7200);
          conferir(
            (await agendas.reconcile({ ...entrada, scheduleId: agendaId, cancel: false })) ===
              "applied",
            "matrix_schedule_not_applied",
          );
          prova.exactScheduleReplay = true;
          prova.priorOfferPreservedUntilBoundary = true;
          prova.sourceRefundAppliedBeforeBoundary = true;
        }
        const atual = await stripe.subscriptions.retrieve(assinatura.id, {}, opcoes());
        conferir(
          atual.id === assinatura.id &&
            !atual.livemode &&
            id(atual.customer) === cliente.id &&
            atual.items.data[0]?.price.id === destino.priceId &&
            atual.metadata.product_id === origem.productId &&
            atual.metadata.subject_id === ator &&
            atual.metadata.checkout_intent_id === autorizacaoId,
          "matrix_result_scope",
        );
        const ler = () =>
          financiamento.conferirCliente(
            {
              clienteId: cliente.id,
              paganteId: ator,
              assinaturaIds: [assinatura.id],
              precosAceitos: aceitos,
            },
            { deadlineMs: prazo },
          );
        const antesDoEstorno = await ler();
        const alvo = antesDoEstorno.financiamento.periodos.filter(
          (p) => p.precoId === destino.priceId,
        );
        conferir(alvo.length === 1 && alvo[0]?.estado === "comprovado", "matrix_target_not_funded");
        if (tipo === "upgrade")
          conferir(
            alvo[0]?.faturaId === faturaDaTroca && alvo[0]?.capturasDeOrigem.includes(captura.id),
            "matrix_credit_source_missing",
          );
        else
          conferir(
            !alvo[0]?.capturasDeOrigem.includes(captura.id),
            "matrix_renewal_borrows_old_capture",
          );
        if (tipo === "upgrade") await estornarOrigem();
        const depoisDoEstorno = tipo === "upgrade" ? await ler() : antesDoEstorno,
          dependente = depoisDoEstorno.financiamento.periodos.filter(
            (p) => p.precoId === destino.priceId,
          );
        conferir(
          dependente.length === 1 &&
            dependente[0]?.estado === (tipo === "upgrade" ? "revogado" : "comprovado"),
          "matrix_refund_dependency_effect",
        );
        conferir(
          depoisDoEstorno.leituras
            .flatMap((l) => l.funding.captures)
            .find((c) => c.id === captura.id)?.amountRefundedCents === captura.amountCapturedCents,
          "matrix_source_refund_not_observed",
        );
        prova.targetFundingVerified = true;
        prova.sourceRefundEffectVerified = true;
        prova.sourceRefundRevokesTarget = tipo === "upgrade";
        prova.sameSubscriptionPreserved = true;
        prova.originalMetadataPreserved = true;
      } catch (encontrado) {
        erro = encontrado;
      } finally {
        const limite = Date.now() + 60_000;
        try {
          // Recover an unknown create response by the exact name of THIS case.
          let criacaoIncerta = false;
          if (!relogio && criacaoDoRelogioTentada) {
            try {
              relogio = await stripe.testHelpers.testClocks.create(
                { name: nome, frozen_time: instanteInicial },
                opcoes(limite, `${chave}:clock`),
              );
            } catch {
              criacaoIncerta = true;
            }
          }
          if (!relogio && criacaoDoRelogioTentada) {
            let cursor: string | undefined,
              vistos = 0;
            const encontrados: Stripe.TestHelpers.TestClock[] = [];
            for (;;) {
              const pagina = await stripe.testHelpers.testClocks.list(
                { limit: 100, ...(cursor ? { starting_after: cursor } : {}) },
                opcoes(limite),
              );
              vistos += pagina.data.length;
              conferir(vistos <= 600, "matrix_cleanup_clock_inventory");
              encontrados.push(...pagina.data.filter((c) => c.name === nome));
              if (pagina.has_more === false) break;
              conferir(pagina.has_more === true, "matrix_cleanup_clock_page_incomplete");
              const proximo = pagina.data.at(-1)?.id;
              conferir(proximo && proximo !== cursor, "matrix_cleanup_clock_cursor");
              cursor = proximo;
            }
            conferir(encontrados.length <= 1, "matrix_cleanup_clock_ambiguous");
            relogio = encontrados[0];
          }
          conferir(relogio || !criacaoIncerta, "matrix_cleanup_clock_creation_unknown");
          if (relogio) {
            const clock = await stripe.testHelpers.testClocks.retrieve(
              relogio.id,
              {},
              opcoes(limite),
            );
            conferir(!clock.livemode && clock.name === nome, "matrix_cleanup_clock_scope");
            const clientes = await stripe.customers.list(
              { test_clock: clock.id, limit: 100 },
              opcoes(limite),
            );
            conferir(
              clientes.has_more === false && clientes.data.length <= 1,
              "matrix_cleanup_customer_inventory",
            );
            for (const dono of clientes.data) {
              conferir(
                !dono.livemode &&
                  id(dono.test_clock) === clock.id &&
                  (!clienteId || dono.id === clienteId) &&
                  dono.metadata.recreio_homologacao_run === config.runId &&
                  dono.metadata.recreio_matrix_case === String(numero),
                "matrix_cleanup_customer_scope",
              );
              const assinaturas = await stripe.subscriptions.list(
                { customer: dono.id, status: "all", limit: 100 },
                opcoes(limite),
              );
              conferir(
                assinaturas.has_more === false && assinaturas.data.length <= 1,
                "matrix_cleanup_subscription_inventory",
              );
              for (const sub of assinaturas.data) {
                conferir(
                  !sub.livemode &&
                    id(sub.customer) === dono.id &&
                    (!assinaturaId || sub.id === assinaturaId) &&
                    sub.metadata.recreio_homologacao_run === config.runId &&
                    sub.metadata.recreio_matrix_case === String(numero) &&
                    sub.metadata.checkout_intent_id === autorizacaoId,
                  "matrix_cleanup_subscription_scope",
                );
                const anexada = id(sub.schedule);
                if (anexada) {
                  const agenda = await stripe.subscriptionSchedules.retrieve(
                    anexada,
                    {},
                    opcoes(limite),
                  );
                  conferir(
                    !agenda.livemode &&
                      id(agenda.customer) === dono.id &&
                      id(agenda.subscription) === sub.id &&
                      (!agendaId || agenda.id === agendaId),
                    "matrix_cleanup_schedule_scope",
                  );
                  if (["active", "not_started"].includes(agenda.status))
                    await stripe.subscriptionSchedules.release(
                      agenda.id,
                      { preserve_cancel_date: true },
                      opcoes(limite),
                    );
                }
                if (!["canceled", "incomplete_expired"].includes(sub.status)) {
                  const cancelada = await stripe.subscriptions.cancel(
                    sub.id,
                    { invoice_now: false, prorate: false },
                    opcoes(limite),
                  );
                  conferir(
                    cancelada.status === "canceled",
                    "matrix_cleanup_subscription_not_canceled",
                  );
                }
              }
            }
            const apagado = await stripe.testHelpers.testClocks.del(clock.id, {}, opcoes(limite));
            conferir(apagado.deleted, "matrix_cleanup_clock_not_deleted");
          }
          limpezaConfirmada = true;
        } catch (encontrado) {
          erroDaLimpeza = encontrado;
        }
      }
      falhou = Boolean(erro || erroDaLimpeza);
      casos.push({
        fromProductId: origem.productId,
        toProductId: destino.productId,
        kind: tipo,
        clockId: relogio?.id,
        clockName: nome,
        customerId: clienteId,
        subscriptionId: assinaturaId,
        scheduleId: agendaId,
        cleanupConfirmed: limpezaConfirmada,
        ...prova,
        status: falhou ? "failed" : "passed",
        failure: erro ? falha(erro) : null,
        cleanupFailure: erroDaLimpeza ? falha(erroDaLimpeza) : null,
      });
    }
  return {
    cases: casos,
    directionsVerified: casos.filter((c) => c.status === "passed").length,
    cleanupConfirmed: casos.length > 0 && casos.every((c) => c.cleanupConfirmed === true),
    status: !falhou && casos.length === 12 ? "passed" : "failed",
  };
}
