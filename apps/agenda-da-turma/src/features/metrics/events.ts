import "server-only";
import { db } from "@informach/db";
import { agendaProductEvents } from "@informach/db/schema";
import { z } from "zod";
import { logger } from "@/lib/logger";

export const productEventSchema = z
  .object({
    event: z.enum([
      "notice_attempt",
      "notice_parsed",
      "notice_failed",
      "notice_confirmed",
      "action_completed",
      "family_joined",
      "reminders_enabled",
      "calendar_connected",
      "trial_started",
      "signup",
      "qualified_visit",
    ]),
    source: z.enum(["teams", "batista", "notebook", "other", "manual"]).optional(),
    count: z.number().int().min(0).max(1000).optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();
export async function recordProductEvent(
  userId: string | null,
  input: z.infer<typeof productEventSchema>,
) {
  const event = productEventSchema.parse(input);
  try {
    await db.insert(agendaProductEvents).values({ userId, ...event });
  } catch {
    logger.warn({ event: event.event }, "agenda.metrics.write_failed");
  }
}
