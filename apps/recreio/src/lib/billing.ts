import "server-only";
import { createBillingService } from "@informach/billing";
import { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { db } from "@informach/db";
import { conferirCatalogoDoRecreio, produtosDoRecreio } from "@/features/cobranca/catalogo";
import { emailDoPagante } from "@/features/cobranca/clientes-repository";
import type { RuntimeDeCompra } from "@/features/cobranca/runtime";
import { env } from "./env";
import { assertAllowed } from "./errors";
import { packageLogger } from "./observability";

let runtime: RuntimeDeCompra | undefined;
/** Configuração e clientes vivem só na composição; nunca em página/formulário. */
export function getRuntimeDaCompra(): RuntimeDeCompra {
  if (runtime) return runtime;
  const chave = env.STRIPE_SECRET_KEY,
    segredo = env.STRIPE_WEBHOOK_SECRET,
    portalId = env.STRIPE_PORTAL_CONFIGURATION_ID;
  assertAllowed(
    env.RECREIO_BILLING_MODE === "sandbox" &&
      env.STRIPE_MODE === "dev" &&
      chave &&
      segredo &&
      portalId,
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  const produtos = produtosDoRecreio("dev", env);
  const provider = createStripeProvider({
    secretKey: chave,
    webhookSecret: segredo,
    appName: "Recreio",
  });
  const leitor = createStripePaymentFactReader({ secretKey: chave });
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
  runtime = {
    async conferirCatalogo() {
      await conferirCatalogoDoRecreio({
        leitor,
        modo: "dev",
        variaveis: env,
        portalId,
        urlDoApp: env.NEXT_PUBLIC_APP_URL,
      });
    },
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
