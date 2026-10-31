import { db } from "@informach/db";
import { buildUnsubscribeToken, createEmailService, type EmailCategory } from "@informach/emails";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { handleSendgridEvents, type SendgridEvent } from "@informach/emails/webhook";
import { env } from "./env";
import { audit, packageLogger } from "./observability";

export const emails = createEmailService({
  apiKey: env.SENDGRID_API_KEY,
  defaultFrom: env.SENDGRID_FROM,
  db,
  mode: env.EMAIL_SANDBOX_MODE,
  sandboxDir: env.EMAIL_SANDBOX_DIR,
  onAudit: audit,
  logger: packageLogger,
});
export function buildUnsubscribeUrl(identifier: string, category: EmailCategory) {
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category)}`;
}
export function unsubscribe(token: string) {
  return processUnsubscribe({ db, secret: env.BETTER_AUTH_SECRET, onAudit: audit }, token);
}
export function processEmailEvents(events: SendgridEvent[]) {
  return handleSendgridEvents({ db, onAudit: audit, logger: packageLogger }, events);
}
