import {
  buildUnsubscribeToken,
  createEmailService,
  createSendGridSend,
  type EmailCategory,
} from "@informach/emails";
import {
  recoverStaleDeliveries,
  retryFailedDeliveries,
  syncSendgridSuppressions,
} from "@informach/emails/sweepers";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { handleSendgridEvents, type SendgridEvent } from "@informach/emails/webhook";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";
import { emailDb } from "./repository";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;

export const emails = createEmailService({
  apiKey: env.SENDGRID_API_KEY,
  defaultFrom: env.SENDGRID_FROM,
  db: emailDb,
  mode: env.EMAIL_SANDBOX_MODE,
  sandboxDir: env.EMAIL_SANDBOX_DIR,
  logger: packageLogger,
});

export function buildEmailUnsubscribeUrl(identifier: string, category: EmailCategory): string {
  const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
}

export function getEmailUnsubscribeMailto(): string {
  return `unsubscribe@${APP_HOSTNAME}`;
}

export async function processEmailUnsubscribe(token: string) {
  return processUnsubscribe({ db: emailDb, secret: env.BETTER_AUTH_SECRET }, token);
}

export async function handleValidatedSendgridEvents(events: SendgridEvent[]) {
  return handleSendgridEvents({ db: emailDb, logger: packageLogger }, events);
}

export async function recoverStaleEmailDeliveries() {
  return recoverStaleDeliveries({ db: emailDb });
}

export async function syncEmailSuppressions() {
  return syncSendgridSuppressions({ db: emailDb, apiKey: env.SENDGRID_API_KEY });
}

export async function retryAppFailedDeliveries() {
  const send = createSendGridSend(env.SENDGRID_API_KEY);

  return retryFailedDeliveries({
    db: emailDb,
    defaultFrom: env.SENDGRID_FROM,
    send,
    buildUnsubscribeUrl: buildEmailUnsubscribeUrl,
    unsubscribeMailto: getEmailUnsubscribeMailto(),
    logger: packageLogger,
  });
}
