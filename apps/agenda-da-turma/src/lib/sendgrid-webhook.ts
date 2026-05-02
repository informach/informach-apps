import type { SendgridEvent } from "@informach/emails/webhook";
import { z } from "zod";

const sendgridEventSchema = z
  .object({
    email: z.string().email(),
    event: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sg_message_id: z.string().min(1).optional(),
    reason: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    delivery_id: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    user_id: z.string().min(1).optional(),
  })
  .passthrough();

const sendgridEventsSchema = z.array(sendgridEventSchema);

export type ParseSendgridWebhookPayloadResult =
  | { ok: true; events: SendgridEvent[] }
  | { ok: false; reason: "invalid-json" | "invalid-schema"; issues?: string[] };

export function parseSendgridWebhookPayload(rawBody: Buffer): ParseSendgridWebhookPayloadResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  const parsed = sendgridEventsSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid-schema",
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  return { ok: true, events: parsed.data };
}
