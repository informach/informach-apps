import { logAuditEvent } from "@informach/auth";
import { db } from "@informach/db";
import { createEmailService, type EmailAuditEvent } from "@informach/emails";
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
