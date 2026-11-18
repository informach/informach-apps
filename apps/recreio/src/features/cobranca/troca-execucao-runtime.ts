import type { PaymentReadBudget } from "@informach/billing/payment-facts";
import type {
  PlanScheduleProvider,
  RecreioPlanScheduleInput,
} from "@informach/billing/providers/stripe-plans";
import type { Product, StripeMode } from "@informach/config";

/** Server-only capability for a durable attempt already accepted by its payer.
 * No customer creation, Checkout or general subscription administration. */
export type RuntimeDeEnvioDaTroca = {
  modo: StripeMode;
  produtos: readonly Product[];
  conferirCatalogo: (budget: PaymentReadBudget) => Promise<void>;
  agendas: PlanScheduleProvider<RecreioPlanScheduleInput>;
};
