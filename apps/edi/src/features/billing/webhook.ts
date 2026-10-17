import { getBilling, getPaymentReader } from "../../lib/billing";
import { readRequestBody } from "../../lib/request-body";
import { withBillingLifecycle } from "./lifecycle";
import { billingCustomerOwner, enqueueBillingCustomer } from "./repository";
export async function processStripeWebhook(request: Request) {
  const billing = getBilling();
  const event = billing.verifyWebhookSignature(
    await readRequestBody(request, 1048576),
    request.headers.get("stripe-signature"),
  );
  const data = event.payload.data;
  const object = data && typeof data === "object" && "object" in data ? data.object : null;
  const relevant =
    event.type.startsWith("invoice.") ||
    event.type.startsWith("customer.subscription.") ||
    event.type.startsWith("charge.refunded") ||
    event.type.startsWith("charge.dispute.");
  const customerId = await getPaymentReader().eventCustomerId(object);
  const userId = customerId ? await billingCustomerOwner(customerId) : null;
  if (!userId || !customerId) return { status: "ignored" };
  return withBillingLifecycle(userId, async () => {
    if (relevant) {
      const fullRefund =
        event.type === "charge.refunded" &&
        object &&
        typeof object === "object" &&
        "refunded" in object &&
        object.refunded === true;
      if (customerId)
        await enqueueBillingCustomer(
          customerId,
          event.id,
          Boolean(fullRefund || event.type === "charge.dispute.created"),
        );
    }
    return billing.handleStripeEvent(event);
  });
}
