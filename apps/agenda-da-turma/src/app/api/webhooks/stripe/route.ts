import { STRIPE_SIGNATURE_HEADER, WebhookSignatureError } from "@informach/billing";
import { billing } from "@/lib/billing";
import { logger } from "@/lib/logger";

// Stripe webhook signature verification uses Node crypto — runtime must be
// nodejs (not edge). Explicit declaration keeps Next 16 from picking edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);
  const rawBody = await request.text();

  let event;
  try {
    event = billing.verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      logger.warn({ error: err.message }, "billing.webhook.invalid_signature");
      return new Response("Invalid signature", { status: 400 });
    }
    throw err;
  }

  try {
    const result = await billing.handleStripeEvent(event);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Returning 500 lets Stripe retry the webhook with backoff.
    logger.error(
      {
        eventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      },
      "billing.webhook.handler_error",
    );
    return new Response("Webhook handler error", { status: 500 });
  }
}
