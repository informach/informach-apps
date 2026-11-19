import type { CheckoutResult, SubscriptionCheckoutOptions } from "@informach/billing";
import type { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";

/** Composição servidor: sem segredos ou dependência do provedor nos formulários. */
export type RuntimeDeCompra = {
  conferirCatalogo: () => Promise<void>;
  precoDoProduto: (id: string) => string;
  urlDeRetorno: string;
  criarCheckout: (entrada: SubscriptionCheckoutOptions) => Promise<CheckoutResult>;
  inspecionar: (
    paganteId: string,
    autorizacaoId: string,
  ) => ReturnType<typeof inspectUserCheckoutAuthorization>;
};
