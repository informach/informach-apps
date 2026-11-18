import { InvalidRequestBodyError, PayloadTooLargeError } from "@informach/auth/request-body";
import { WebhookSignatureError } from "@informach/billing";
import { ZodError } from "zod";
import { receberWebhook } from "@/features/cobranca/webhook";
import { AppError } from "@/lib/errors";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    return Response.json(await receberWebhook(request), { headers: HEADERS });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return Response.json({ error: "payload_too_large" }, { status: 413, headers: HEADERS });
    if (
      error instanceof InvalidRequestBodyError ||
      error instanceof ZodError ||
      error instanceof WebhookSignatureError ||
      (error instanceof AppError && error.code === "ORIGEM_FINANCEIRA")
    )
      return Response.json({ error: "invalid_event" }, { status: 400, headers: HEADERS });
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json(
      { error: "webhook_retry_required", incident },
      { status: 503, headers: HEADERS },
    );
  }
}
