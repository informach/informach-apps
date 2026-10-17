import { WebhookSignatureError } from "@informach/billing";
import { processStripeWebhook } from "@/features/billing/webhook";
import { logger } from "@/lib/logger";
import { InvalidRequestBodyError, PayloadTooLargeError } from "@/lib/request-body";
export async function POST(request: Request) {
  try {
    return Response.json(await processStripeWebhook(request));
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    if (error instanceof InvalidRequestBodyError)
      return Response.json({ error: "invalid_input" }, { status: 400 });
    if (error instanceof WebhookSignatureError)
      return Response.json({ error: "invalid_signature" }, { status: 400 });
    logger.error(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "stripe.webhook_failed",
    );
    return Response.json({ error: "webhook_retry_required" }, { status: 503 });
  }
}
