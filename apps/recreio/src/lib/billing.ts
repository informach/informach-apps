import "server-only";
import { createBillingService } from "@informach/billing";
import { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import {
  createStripePaymentFactReader,
  type PaymentReadBudget,
} from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { createStripeRecreioPlanSchedules } from "@informach/billing/providers/stripe-plans";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { createStripeRecreioRenewals } from "@informach/billing/providers/stripe-recreio-renewals";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import { db } from "@informach/db";
import Stripe from "stripe";
import { conferirCatalogoDoRecreio, produtosDoRecreio } from "@/features/cobranca/catalogo";
import { emailDoPagante } from "@/features/cobranca/clientes-repository";
import type { RuntimeDeConciliacao } from "@/features/cobranca/conciliacao-runtime";
import { criarConferenciaDeFinanciamento } from "@/features/cobranca/financiamento-stripe";
import type { RuntimeDoPortal } from "@/features/cobranca/portal-service";
import type { RuntimeDoCancelamentoDaRenovacao } from "@/features/cobranca/renovacao-execucao-service";
import type { RuntimeDeCompra } from "@/features/cobranca/runtime";
import type { RuntimeDeEnvioDoAumento } from "@/features/cobranca/troca-aumento-execucao-service";
import type { RuntimeDeEnvioDaTroca } from "@/features/cobranca/troca-execucao-runtime";
import type { RuntimeDoWebhook } from "@/features/cobranca/webhook-service";
import type { RuntimeFinanceiroDoEncerramento } from "@/features/direitos/encerramento-financeiro-execucao-service";
import { envioComercialDisponivel, segredoStripeCompativel } from "./commercial-mode";
import { env } from "./env";
import { assertAllowed } from "./errors";
import { packageLogger } from "./observability";

let runtime: RuntimeDeCompra | undefined;
let renovacoes: RuntimeDoCancelamentoDaRenovacao | undefined;
let inventarioDoEncerramento: RuntimeFinanceiroDoEncerramento | undefined;
export function getRuntimeFinanceiroDoEncerramento(): RuntimeFinanceiroDoEncerramento {
  assertAllowed(
    env.RECREIO_PORTAL_RENEWAL_MODE === "native" && env.RECREIO_RENEWAL_JOBS_MODE === "on",
    "INDISPONIVEL",
    "A coordenação do encerramento financeiro ainda não está disponível.",
  );
  if (inventarioDoEncerramento) return inventarioDoEncerramento;
  const chave = env.STRIPE_SECRET_KEY;
  assertAllowed(
    chave && segredoStripeCompativel(env.STRIPE_MODE, chave),
    "INDISPONIVEL",
    "A coordenação financeira ainda não está configurada.",
  );
  inventarioDoEncerramento = {
    modo: env.STRIPE_MODE,
    inventario: createStripeRecreioClosureInventory({ secretKey: chave, mode: env.STRIPE_MODE }),
  };
  return inventarioDoEncerramento;
}
/** No sale catalog, webhook or portal dependency to stop an existing renewal. */
export function getRuntimeDoCancelamentoDaRenovacao(): RuntimeDoCancelamentoDaRenovacao {
  if (renovacoes) return renovacoes;
  const chave = env.STRIPE_SECRET_KEY;
  assertAllowed(
    chave && segredoStripeCompativel(env.STRIPE_MODE, chave),
    "INDISPONIVEL",
    "A interrupção da renovação ainda não está configurada.",
  );
  renovacoes = {
    modo: env.STRIPE_MODE,
    renovacoes: createStripeRecreioRenewals({ secretKey: chave, mode: env.STRIPE_MODE }),
  };
  return renovacoes;
}
let composicao: ReturnType<typeof criarComposicao> | undefined;
/** Configuração e clientes vivem só na composição; nunca em página/formulário. */
function criarComposicao() {
  const modo = env.STRIPE_MODE,
    chave = env.STRIPE_SECRET_KEY,
    segredo = env.STRIPE_WEBHOOK_SECRET,
    portalId = env.STRIPE_PORTAL_CONFIGURATION_ID;
  assertAllowed(
    chave &&
      segredo &&
      portalId &&
      segredoStripeCompativel(modo, chave) &&
      segredo.startsWith("whsec_") &&
      portalId.startsWith("bpc_"),
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  const produtos = produtosDoRecreio(modo, env);
  const provider = createStripeProvider({
    secretKey: chave,
    webhookSecret: segredo,
    appName: "Recreio",
    timeoutMs: 10_000,
    maxNetworkRetries: 0,
  });
  const leitor = createStripePaymentFactReader({
    secretKey: chave,
    expectedMode: modo,
    timeoutMs: 10_000,
    maxNetworkRetries: 0,
  });
  const financiamento = criarConferenciaDeFinanciamento({
    modo,
    leitor,
    cliente: new Stripe(chave, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 10_000,
      maxNetworkRetries: 0,
    }),
  });
  const billing = createBillingService({
    db,
    app: "recreio",
    appName: "Recreio",
    provider: "stripe",
    providerClient: provider,
    managedCheckout: true,
    guardClosedBilling: true,
    portalConfigurationId: portalId,
    products: produtos,
    organizationsEnabled: false,
    stripeMode: modo,
    publicAppUrl: env.NEXT_PUBLIC_APP_URL,
    resolveSubjectEmail: emailDoPagante,
    logger: packageLogger,
  });
  return {
    modo,
    produtos,
    provider,
    leitor,
    financiamento,
    billing,
    agendasAdmitidas: createStripeRecreioPlanSchedules({ secretKey: chave, mode: modo }),
    aumentosAdmitidos: createStripeRecreioUpgrades({ secretKey: chave, mode: modo }),
    async conferirCatalogo(budget?: PaymentReadBudget) {
      await conferirCatalogoDoRecreio({
        leitor,
        modo,
        variaveis: env,
        portalId,
        urlDoApp: env.NEXT_PUBLIC_APP_URL,
        renovacao: env.RECREIO_PORTAL_RENEWAL_MODE,
        budget,
      });
    },
  };
}
function getComposicao() {
  composicao ??= criarComposicao();
  return composicao;
}
export function getRuntimeDaCompra(): RuntimeDeCompra {
  assertAllowed(
    envioComercialDisponivel(env.RECREIO_BILLING_MODE),
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  return getRuntimeCompartilhadoDaCompra();
}
export function getRuntimeDaConsultaDaCompra(): RuntimeDeCompra {
  return getRuntimeCompartilhadoDaCompra();
}
function getRuntimeCompartilhadoDaCompra(): RuntimeDeCompra {
  if (runtime) return runtime;
  const { modo, produtos, provider, billing, conferirCatalogo } = getComposicao();
  runtime = {
    conferirCatalogo,
    precoDoProduto(id) {
      const produto = produtos.find((p) => p.id === id);
      assertAllowed(produto, "OFERTA", "Confira a oferta atual antes de continuar.");
      return produto.stripePriceId[modo];
    },
    urlDeRetorno: `${new URL(env.NEXT_PUBLIC_APP_URL).origin}/conta/assinatura?retorno=1`,
    criarCheckout: (entrada) => billing.createSubscriptionCheckout(entrada),
    inspecionar: (paganteId, autorizacaoId) =>
      inspectUserCheckoutAuthorization(
        { db, app: "recreio", provider: "stripe", providerClient: provider },
        paganteId,
        autorizacaoId,
      ),
  };
  return runtime;
}

/** Financial reads and recovery restricted to previously admitted plan changes. */
export function getRuntimeDaConciliacao(): RuntimeDeConciliacao {
  const {
    modo,
    produtos,
    provider,
    leitor,
    financiamento,
    conferirCatalogo,
    agendasAdmitidas,
    aumentosAdmitidos,
  } = getComposicao();
  const lerCheckout = provider.findCheckoutSession;
  assertAllowed(lerCheckout, "INDISPONIVEL", "A conferência financeira não está disponível.");
  return {
    modo,
    produtos,
    leitor,
    financiamento,
    conferirCatalogo,
    lerCheckout,
    agendasAdmitidas,
    aumentosAdmitidos,
  };
}

export function getRuntimeDoWebhook(): RuntimeDoWebhook {
  const { modo, provider, leitor } = getComposicao();
  return {
    modo,
    verificar: provider.verifyWebhookSignature,
    clienteDoEvento: leitor.eventCustomerId,
  };
}

export function getRuntimeDoPortal(): RuntimeDoPortal {
  const { billing, conferirCatalogo } = getComposicao();
  return {
    conferirCatalogo,
    criarPortal: (paganteId) =>
      billing.createPortalSession({
        subject: { type: "user", id: paganteId },
        returnUrl: `${new URL(env.NEXT_PUBLIC_APP_URL).origin}/conta/assinatura`,
      }),
  };
}

export function getRuntimeDoAumento(): RuntimeDeEnvioDoAumento {
  const c = getComposicao();
  return {
    modo: c.modo,
    produtos: c.produtos,
    conferirCatalogo: c.conferirCatalogo,
    aumentos: c.aumentosAdmitidos,
  };
}
export function getRuntimeDaReducao(): RuntimeDeEnvioDaTroca {
  const c = getComposicao();
  return {
    modo: c.modo,
    produtos: c.produtos,
    conferirCatalogo: c.conferirCatalogo,
    agendas: c.agendasAdmitidas,
  };
}
