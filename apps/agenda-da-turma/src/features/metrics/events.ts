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
      // Quanto da leitura já chega com a matéria certa, e quanto a família
      // ainda precisa vincular na mão. `count` é o número de atividades
      // daquela importação; nada sobre o conteúdo escolar.
      "subject_auto_matched",
      "subject_hint_unmatched",
      "draft_action_discarded",
      "draft_discarded",
      "shared_accept_all",
      "first_steps_dismissed",
      "study_plan_created",
      // O resumo semanal NÃO tem evento próprio de propósito: quem já conta os
      // envios é `agenda.notification_deliveries`, com a chave `weekly:<dia>` e
      // o estado real da entrega. Um segundo contador aqui discordaria dele no
      // primeiro reenvio.
      "subject_kit_saved",
      "inbox_message_received",
      "inbox_message_used",
    ]),
    source: z.enum(["teams", "batista", "notebook", "whatsapp", "other", "manual"]).optional(),
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
