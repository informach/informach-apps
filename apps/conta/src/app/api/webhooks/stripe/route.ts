import {
  InvalidRequestBodyError,
  PayloadTooLargeError,
  readRequestBody,
} from "@informach/auth/request-body";
import { WebhookSignatureError } from "@informach/billing";
import { receiveBillingEvent } from "@/features/billing/service";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
    return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const raw = await readRequestBody(request, 512 * 1024);
    await receiveBillingEvent(raw, request.headers.get("stripe-signature"));
    // Acknowledgement means durable work; the authenticated worker reads payment facts.
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof WebhookSignatureError || error instanceof InvalidRequestBodyError)
      return Response.json({ error: "invalid_request" }, { status: 400 });
    if (error instanceof PayloadTooLargeError)
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    reportOperationalError("billing.webhook.failed", error);
    return Response.json({ error: "retry_later" }, { status: 503 });
  }
}
