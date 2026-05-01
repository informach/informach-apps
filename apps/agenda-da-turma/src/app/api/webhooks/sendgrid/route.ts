import { db } from "@informach/db";
import {
  handleSendgridEvents,
  SENDGRID_SIGNATURE_HEADER,
  SENDGRID_TIMESTAMP_HEADER,
  type SendgridEvent,
  verifySendgridSignature,
} from "@informach/emails/webhook";
import { env } from "@/lib/env";

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

  let events: SendgridEvent[];
  try {
    events = JSON.parse(rawBody.toString("utf8")) as SendgridEvent[];
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (!Array.isArray(events)) {
    return new Response("Expected array", { status: 400 });
  }

  const result = await handleSendgridEvents({ db }, events);
  return Response.json({ ok: true, ...result });
}
