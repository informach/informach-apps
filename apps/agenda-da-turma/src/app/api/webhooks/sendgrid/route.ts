import { db } from "@informach/db";
import {
  handleSendgridEvents,
  SENDGRID_SIGNATURE_HEADER,
  SENDGRID_TIMESTAMP_HEADER,
  verifySendgridSignature,
} from "@informach/emails/webhook";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { packageLogger } from "@/lib/observability";
import { parseSendgridWebhookPayload } from "@/lib/sendgrid-webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!env.SENDGRID_WEBHOOK_PUBLIC_KEY) {
    return new Response("Webhook not configured", { status: 503 });
  }

  const signature = request.headers.get(SENDGRID_SIGNATURE_HEADER);
  const timestamp = request.headers.get(SENDGRID_TIMESTAMP_HEADER);
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifySendgridSignature(env.SENDGRID_WEBHOOK_PUBLIC_KEY, rawBody, signature, timestamp)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const parsed = parseSendgridWebhookPayload(rawBody);
  if (!parsed.ok) {
    logger.warn(
      { reason: parsed.reason, issues: parsed.issues },
      "email.webhook.sendgrid.invalid_payload",
    );
    return new Response("Invalid payload", { status: 400 });
  }

  const result = await handleSendgridEvents({ db, logger: packageLogger }, parsed.events);
  if (result.failed > 0) {
    logger.error(result, "email.webhook.sendgrid.partial_failure");
    return Response.json({ ok: false, ...result }, { status: 500 });
  }

  return Response.json({ ok: true, ...result });
}
