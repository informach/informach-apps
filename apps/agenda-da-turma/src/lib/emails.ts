import { logAuditEvent } from "@informach/auth";
import { db, eq } from "@informach/db";
import { agendaNotificationPreferences } from "@informach/db/schema";
import {
  buildUnsubscribeToken,
  createEmailService,
  createSendGridSend,
  type EmailAuditEvent,
  type EmailCategory,
} from "@informach/emails";
import {
  recoverStaleDeliveries,
  retryFailedDeliveries,
  syncSendgridSuppressions,
} from "@informach/emails/sweepers";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { handleSendgridEvents, type SendgridEvent } from "@informach/emails/webhook";
import { unsubscribeMailto } from "./email-identity";
import { env } from "./env";
import { logger } from "./logger";
import { packageLogger } from "./observability";

export function emailAudit(event: EmailAuditEvent): void {
  logAuditEvent(event.eventType, event.actorId, event.payload).catch((err) => {
    logger.error(
      {
        eventType: event.eventType,
        error: err instanceof Error ? err.message : String(err),
      },
      "email.audit.persist_failed",
    );
  });
}

export const emails = createEmailService({
  apiKey: env.SENDGRID_API_KEY,
  defaultFrom: env.SENDGRID_FROM,
  db,
  mode: env.EMAIL_SANDBOX_MODE,
  sandboxDir: env.EMAIL_SANDBOX_DIR,
  logger: packageLogger,
  onAudit: emailAudit,
});

const sendgridSend = createSendGridSend(env.SENDGRID_API_KEY);

export function buildEmailUnsubscribeUrl(identifier: string, category: EmailCategory): string {
  const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
}

export async function processAgendaEmailUnsubscribe(token: string) {
  const result = await processUnsubscribe(
    { db, secret: env.BETTER_AUTH_SECRET, onAudit: emailAudit },
    token,
  );
  if (result.ok && result.category === "agenda.routine" && result.userId)
    await db
      .update(agendaNotificationPreferences)
      .set({ emailEnabled: false, updatedAt: new Date() })
      .where(eq(agendaNotificationPreferences.userId, result.userId));
  return result;
}

export function handleAgendaSendgridEvents(events: SendgridEvent[]) {
  return handleSendgridEvents({ db, logger: packageLogger, onAudit: emailAudit }, events);
}

export function syncAgendaSendgridSuppressions() {
  return syncSendgridSuppressions({
    db,
    apiKey: env.SENDGRID_API_KEY,
    onAudit: emailAudit,
  });
}

export function retryAgendaFailedDeliveries() {
  return retryFailedDeliveries({
    db,
    defaultFrom: env.SENDGRID_FROM,
    send: sendgridSend,
    buildUnsubscribeUrl: buildEmailUnsubscribeUrl,
    unsubscribeMailto,
    logger: packageLogger,
    onAudit: emailAudit,
  });
}

export function recoverAgendaStaleDeliveries() {
  return recoverStaleDeliveries({ db });
}
