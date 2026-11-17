import "server-only";
import { logAuditEvent } from "@informach/auth";
import { db } from "@informach/db";
import { buildUnsubscribeToken, createEmailService, type EmailCategory } from "@informach/emails";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { getEnv } from "./env";
import { reportOperationalError } from "./observability";

let instance: ReturnType<typeof createEmailService> | undefined;
export function getEmails() {
  const env = getEnv();
  instance ??= createEmailService({
    db,
    apiKey: env.SENDGRID_API_KEY,
    defaultFrom: env.SENDGRID_FROM,
    mode: env.EMAIL_SANDBOX_MODE,
    sandboxDir: env.EMAIL_SANDBOX_DIR,
    onAudit(event) {
      void logAuditEvent(event.eventType, event.actorId, event.payload).catch((error) =>
        reportOperationalError("email.audit_failed", error),
      );
    },
  });
  return instance;
}
export function emailUnsubscribeUrl(identifier: string, category: EmailCategory) {
  const env = getEnv();
  return `${env.origin}/api/email/unsubscribe?t=${buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category)}`;
}

export function unsubscribeEmail(token: string) {
  return processUnsubscribe({ db, secret: getEnv().BETTER_AUTH_SECRET }, token);
}
