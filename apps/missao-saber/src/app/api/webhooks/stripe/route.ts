import { STRIPE_SIGNATURE_HEADER, WebhookSignatureError } from "@informach/billing";
import { billing, handleBillingEvent } from "@/features/billing/service";
import { boundedBody } from "@/lib/http";
import { reportError } from "@/lib/observability";

export async function POST(request: Request) {
  const rawBody = await boundedBody(request);
  if (rawBody === null) return new Response("Payload too large", { status: 413 });
  try {
    const event = billing.verifyWebhookSignature(
      rawBody,
      request.headers.get(STRIPE_SIGNATURE_HEADER),
    );
    const result = await handleBillingEvent(event);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WebhookSignatureError)
      return new Response("Invalid signature", { status: 400 });
    reportError(error, crypto.randomUUID());
    return new Response("Webhook processing failed", { status: 500 });
  }
}
