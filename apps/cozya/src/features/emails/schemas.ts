import type { SendgridEvent } from "@informach/emails/webhook";
import { z } from "zod";

const sendgridEventSchema = z
  .object({
    email: z.string().min(1),
    event: z.string().min(1),
    timestamp: z.number(),
    sg_message_id: z.string().min(1).optional(),
    reason: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    delivery_id: z.string().min(1).optional(),
    category: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    informach_category: z.string().min(1).optional(),
    user_id: z.string().min(1).optional(),
  })
  .strip();

const sendgridEventsPayloadSchema = z.array(sendgridEventSchema).min(1);

export type ParseSendgridEventsPayloadResult =
  | { ok: true; events: SendgridEvent[] }
  | { ok: false; issues: z.ZodIssue[] };

export function parseSendgridEventsPayload(input: unknown): ParseSendgridEventsPayloadResult {
  const parsed = sendgridEventsPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues };
  }

  return { ok: true, events: parsed.data };
}
