import { logAuditEvent } from "@informach/auth";
import { db } from "@informach/db";
import {
  buildUnsubscribeToken,
  createEmailService,
  type EmailAuditEvent,
  type EmailCategory,
} from "@informach/emails";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { getEnv } from "./env";
import { logger, packageLogger } from "./logger";

const audit = (event: EmailAuditEvent) => {
  void logAuditEvent(event.eventType, event.actorId, event.payload).catch(() =>
    logger.error("email.audit_persistence_failed"),
  );
};
let instance: ReturnType<typeof createEmailService> | undefined;
export function getEmails() {
  const env = getEnv();
  instance ??= createEmailService({
    db,
    apiKey: env.SENDGRID_API_KEY,
    defaultFrom: env.SENDGRID_FROM,
    mode: env.EMAIL_SANDBOX_MODE,
    sandboxDir: env.EMAIL_SANDBOX_DIR,
    logger: packageLogger,
    onAudit: audit,
  });
  return instance;
}
export function emailUnsubscribeUrl(identifier: string, category: EmailCategory) {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category)}`;
}
export function unsubscribeEmail(token: string) {
  return processUnsubscribe({ db, secret: getEnv().BETTER_AUTH_SECRET, onAudit: audit }, token);
}
