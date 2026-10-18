import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { agendaProductEvents } from "@informach/db/schema";
import { z } from "zod";
import { APP_TIME_ZONE } from "@/features/dashboard/date";
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
      // envios é `agenda.notification_deliveries`, com a chave `weekly:<data do envio>` e
      // o estado real da entrega. Um segundo contador aqui discordaria dele no
      // primeiro reenvio.
      "subject_kit_saved",
      // Quantas conclusões chegaram DEPOIS, pela fila do aparelho. É a única
      // medida de que a fila serve para alguma coisa: `action_completed` conta
      // a conclusão, e não distingue a que subiu na hora da que esperou a rede.
      "offline_queue_flushed",
      // A promessa da Agenda é "uma olhada por dia". Um registro por adulto por
      // dia em que Hoje abriu, sem nada além do dia: é a única forma de saber
      // se a promessa se cumpre, e abrir mais vezes não conta mais.
      "today_viewed",
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

/**
 * Um `today_viewed` por adulto por dia de São Paulo, no máximo.
 *
 * O aparelho já evita repetir (`TodayViewedBeacon`); a conferência aqui cobre o
 * segundo aparelho e a outra aba. Duas abas abrindo juntas passariam as duas
 * pela consulta antes de qualquer uma gravar, então conferir e gravar
 * acontecem sob uma trava por adulto. Devolve se gravou.
 */
export async function recordTodayViewedOnce(userId: string, todayIso: string) {
  const event = productEventSchema.parse({ event: "today_viewed" });
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:today-viewed:${userId}`}))`,
    );
    const [already] = await tx
      .select({ id: agendaProductEvents.id })
      .from(agendaProductEvents)
      .where(
        and(
          eq(agendaProductEvents.event, "today_viewed"),
          eq(agendaProductEvents.userId, userId),
          sql`(${agendaProductEvents.createdAt} AT TIME ZONE ${APP_TIME_ZONE})::date = ${todayIso}::date`,
        ),
      )
      .limit(1);
    if (already) return false;
    await tx.insert(agendaProductEvents).values({ userId, ...event });
    return true;
  });
}
