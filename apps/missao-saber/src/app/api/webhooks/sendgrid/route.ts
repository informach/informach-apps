import {
  SENDGRID_SIGNATURE_HEADER,
  SENDGRID_TIMESTAMP_HEADER,
  verifySendgridSignature,
} from "@informach/emails/webhook";
import { z } from "zod";
import { processEmailEvents } from "@/lib/emails";
import { env } from "@/lib/env";
import { boundedBody } from "@/lib/http";

const eventSchema = z
  .array(
    z.object({
      email: z.string().email(),
      event: z.string().max(60),
      timestamp: z.number(),
      sg_message_id: z.string().optional(),
      delivery_id: z.string().uuid().optional(),
      reason: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      category: z
        .union([z.string().min(1).max(120), z.array(z.string().min(1).max(120)).max(10)])
        .optional(),
      informach_category: z.string().min(1).max(120).optional(),
      user_id: z.string().min(1).max(200).optional(),
    }),
  )
  .max(1000);
export async function POST(request: Request) {
  if (!env.SENDGRID_WEBHOOK_PUBLIC_KEY)
    return new Response("Webhook not configured", { status: 503 });
  const rawBody = await boundedBody(request);
  if (rawBody === null) return new Response("Payload too large", { status: 413 });
  const timestamp = request.headers.get(SENDGRID_TIMESTAMP_HEADER);
  if (
    !timestamp ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !verifySendgridSignature(
      env.SENDGRID_WEBHOOK_PUBLIC_KEY,
      rawBody,
      request.headers.get(SENDGRID_SIGNATURE_HEADER),
      timestamp,
    )
  )
    return new Response("Invalid signature", { status: 400 });
  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return new Response("Invalid events", { status: 400 });
  const result = await processEmailEvents(parsed.data);
  return Response.json(result, { status: result.failed ? 500 : 200 });
}
