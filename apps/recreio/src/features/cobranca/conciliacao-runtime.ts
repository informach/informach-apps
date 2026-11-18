import type { BillingProviderClient } from "@informach/billing";
import type {
  createStripePaymentFactReader,
  PaymentReadBudget,
} from "@informach/billing/payment-facts";
import type { RecreioPlanScheduleProvider } from "@informach/billing/providers/stripe-plans";
import type { RecreioUpgradeProvider } from "@informach/billing/providers/stripe-recreio-upgrades";
import type { Product, StripeMode } from "@informach/config";

/** Financial reads plus an optional capability for previously admitted native
 * reductions. No customer creation, Checkout or arbitrary subscription update. */
export type RuntimeDeConciliacao = {
  modo: StripeMode;
  produtos: readonly Product[];
  conferirCatalogo: (budget?: PaymentReadBudget) => Promise<void>;
  leitor: Pick<ReturnType<typeof createStripePaymentFactReader>, "listSubscriptionIds" | "read">;
  lerCheckout: NonNullable<BillingProviderClient["findCheckoutSession"]>;
  agendasAdmitidas?: RecreioPlanScheduleProvider;
  aumentosAdmitidos?: RecreioUpgradeProvider;
};
