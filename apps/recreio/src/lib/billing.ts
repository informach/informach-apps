import "server-only";
import { createBillingService } from "@informach/billing";
import { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import {
  createStripePaymentFactReader,
  type PaymentReadBudget,
} from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { createStripeRecreioPlanSchedules } from "@informach/billing/providers/stripe-plans";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import { db } from "@informach/db";
import { conferirCatalogoDoRecreio, produtosDoRecreio } from "@/features/cobranca/catalogo";
import { emailDoPagante } from "@/features/cobranca/clientes-repository";
import type { RuntimeDeConciliacao } from "@/features/cobranca/conciliacao-runtime";
import type { RuntimeDoPortal } from "@/features/cobranca/portal-service";
import type { RuntimeDeCompra } from "@/features/cobranca/runtime";
import type { RuntimeDoWebhook } from "@/features/cobranca/webhook-service";
import { env } from "./env";
import { isStripeTestSecret } from "./environment";
import { assertAllowed } from "./errors";
import { packageLogger } from "./observability";

let runtime: RuntimeDeCompra | undefined;
let composicao: ReturnType<typeof criarComposicao> | undefined;
/** Configuração e clientes vivem só na composição; nunca em página/formulário. */
function criarComposicao() {
  const chave = env.STRIPE_SECRET_KEY,
    segredo = env.STRIPE_WEBHOOK_SECRET,
    portalId = env.STRIPE_PORTAL_CONFIGURATION_ID;
  assertAllowed(
    env.STRIPE_MODE === "dev" &&
      chave &&
      segredo &&
      portalId &&
      isStripeTestSecret(chave) &&
      segredo.startsWith("whsec_") &&
      portalId.startsWith("bpc_"),
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  const produtos = produtosDoRecreio("dev", env);
  const provider = createStripeProvider({
    secretKey: chave,
    webhookSecret: segredo,
    appName: "Recreio",
    timeoutMs: 10_000,
    maxNetworkRetries: 0,
  });
  const leitor = createStripePaymentFactReader({
    secretKey: chave,
    expectedMode: "dev",
    timeoutMs: 10_000,
    maxNetworkRetries: 0,
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
    stripeMode: "dev",
    publicAppUrl: env.NEXT_PUBLIC_APP_URL,
    resolveSubjectEmail: emailDoPagante,
    logger: packageLogger,
  });
  return {
    produtos,
    provider,
    leitor,
    billing,
    agendasAdmitidas: createStripeRecreioPlanSchedules({ secretKey: chave, mode: "dev" }),
    aumentosAdmitidos: createStripeRecreioUpgrades({ secretKey: chave, mode: "dev" }),
    async conferirCatalogo(budget?: PaymentReadBudget) {
      await conferirCatalogoDoRecreio({
        leitor,
        modo: "dev",
        variaveis: env,
        portalId,
        urlDoApp: env.NEXT_PUBLIC_APP_URL,
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
    env.RECREIO_BILLING_MODE === "sandbox",
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
  const { produtos, provider, billing, conferirCatalogo } = getComposicao();
  runtime = {
    conferirCatalogo,
    precoDoProduto(id) {
      const produto = produtos.find((p) => p.id === id);
      assertAllowed(produto, "OFERTA", "Confira a oferta atual antes de continuar.");
      return produto.stripePriceId.dev;
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
  const { produtos, provider, leitor, conferirCatalogo, agendasAdmitidas, aumentosAdmitidos } =
    getComposicao();
  const lerCheckout = provider.findCheckoutSession;
  assertAllowed(lerCheckout, "INDISPONIVEL", "A conferência financeira não está disponível.");
  return {
    modo: "dev",
    produtos,
    leitor,
    conferirCatalogo,
    lerCheckout,
    agendasAdmitidas,
    aumentosAdmitidos,
  };
}

export function getRuntimeDoWebhook(): RuntimeDoWebhook {
  const { provider, leitor } = getComposicao();
  return {
    modo: "dev",
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
