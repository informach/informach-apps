import { getBilling, getPaymentReader } from "../../lib/billing";
import { handleStripeWebhook } from "./webhook-handler";

export function processStripeWebhook(request: Request) {
  return handleStripeWebhook(request, { billing: getBilling(), reader: getPaymentReader() });
}
