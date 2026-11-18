import type { BillingProviderClient } from "@informach/billing";
import type { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import type { Product, StripeMode } from "@informach/config";

/** Narrow read-only ports; reconciliation cannot create customers or Checkout. */
export type RuntimeDeConciliacao = {
  modo: StripeMode;
  produtos: readonly Product[];
  conferirCatalogo: () => Promise<void>;
  leitor: Pick<ReturnType<typeof createStripePaymentFactReader>, "listSubscriptionIds" | "read">;
  lerCheckout: NonNullable<BillingProviderClient["findCheckoutSession"]>;
};
