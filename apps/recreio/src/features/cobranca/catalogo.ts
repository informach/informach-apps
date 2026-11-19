import "server-only";
import type {
  createStripePaymentFactReader,
  PaymentReadBudget,
} from "@informach/billing/payment-facts";
import {
  getConfiguredProducts,
  isStripePriceIdConfigured,
  type StripeMode,
} from "@informach/config";

/** Valores/intervalos e nomes das variáveis vêm exclusivamente do catálogo comum. */
export function produtosDoRecreio(modo: StripeMode, variaveis: Readonly<Record<string, unknown>>) {
  return getConfiguredProducts("recreio", modo, variaveis);
}

/** Leitura do provedor, sem criar preço, cliente, Checkout ou cobrança. */
export async function conferirCatalogoDoRecreio(entrada: {
  leitor: Pick<ReturnType<typeof createStripePaymentFactReader>, "verifyCatalog">;
  modo: StripeMode;
  variaveis: Readonly<Record<string, unknown>>;
  portalId: string;
  urlDoApp: string;
  renovacao?: "legacy" | "native";
  budget?: PaymentReadBudget;
}) {
  const produtos = produtosDoRecreio(entrada.modo, entrada.variaveis);
  if (
    !produtos.length ||
    produtos.some((p) => !isStripePriceIdConfigured(p.stripePriceId[entrada.modo]))
  )
    throw new Error("Catálogo comercial do Recreio ainda não configurado.");
  const origem = new URL(entrada.urlDoApp).origin;
  await entrada.leitor.verifyCatalog(
    produtos,
    entrada.modo,
    entrada.portalId,
    {
      planUpdates: "application",
      ...(entrada.renovacao === "native" ? { renewalCancellation: "application" } : {}),
      app: "recreio",
      returnUrl: `${origem}/conta/assinatura`,
      termsUrl: `${origem}/termos`,
      privacyUrl: `${origem}/privacidade`,
    },
    entrada.budget,
  );
  return produtos;
}
