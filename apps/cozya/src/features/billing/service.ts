import { logAuditEvent } from "@informach/auth";
import { createBillingService, type DunningPayload } from "@informach/billing";
import { APPS, isStripePriceIdConfigured, PRODUCTS, type Product } from "@informach/config";
import * as Sentry from "@sentry/nextjs";
import {
  buildEmailUnsubscribeUrl,
  emails,
  getEmailUnsubscribeMailto,
} from "@/features/emails/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { packageLogger } from "@/lib/observability";
import { billingDb, findUserEmailById, resolveSubjectEmail } from "./repository";

const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");
const cozyaProducts = PRODUCTS.filter((p) => p.app === APPS.cozya.slug);
const MAX_DUNNING_ATTEMPTS = 3;

assertProductionStripeCatalogConfigured(cozyaProducts);

export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  db: billingDb,
  appName: APPS.cozya.name,
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  products: cozyaProducts,
  organizationsEnabled: false,
  stripeMode,
  resolveSubjectEmail,
  logger: packageLogger,
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  buildUnsubscribeUrl: buildEmailUnsubscribeUrl,
  unsubscribeMailto: getEmailUnsubscribeMailto(),
  onAudit: (event) => {
    logAuditEvent(event.eventType, event.actorId, event.payload).catch((err) => {
      logger.error(
        {
          eventType: event.eventType,
          error: err instanceof Error ? err.message : String(err),
        },
        "billing.audit.persist_failed",
      );
    });
  },
});

function assertProductionStripeCatalogConfigured(products: readonly Product[]) {
  if (env.NODE_ENV !== "production" || stripeMode !== "prod") return;

  const missingProductIds = products
    .filter((product) => !isStripePriceIdConfigured(product.stripePriceId.prod))
    .map((product) => product.id);

  if (missingProductIds.length > 0) {
    throw new Error(
      `Cozya Stripe production Price IDs are not configured: ${missingProductIds.join(", ")}`,
    );
  }
}

export function reconcileBillingSubscriptions() {
  return billing.reconcileSubscriptions();
}

export function expireBillingMonthlyBonusCredits() {
  return billing.expireMonthlyBonusCredits();
}

export function grantPendingBillingMonthlyBonusCredits() {
  return billing.grantPendingMonthlyBonusCredits();
}

export function releaseBillingExpiredReservations() {
  return billing.releaseExpiredReservations();
}

export async function retryBillingDunningEmails() {
  const result = await billing.retryDunningEmails({
    maxAttempts: MAX_DUNNING_ATTEMPTS,
    cooldownHours: 24,
    send: sendDunningEmail,
  });

  if (result.scanned > 0) {
    logger.info(result, "billing.cron.dunning");
  }

  return result;
}

async function sendDunningEmail({
  subscriptionId,
  subject,
  invoiceId,
  attempt,
}: DunningPayload): Promise<void> {
  if (subject.type !== "user") {
    logger.warn(
      { subscriptionId, subjectType: subject.type },
      "billing.dunning.unexpected_subject_type",
    );
    return;
  }

  const email = await findUserEmailById(subject.id);
  if (!email) {
    logger.warn({ subscriptionId, userId: subject.id }, "billing.dunning.user_not_found");
    Sentry.captureMessage("billing.dunning.user_not_found", {
      level: "warning",
      tags: { subscriptionId },
      extra: { userId: subject.id },
    });
    return;
  }

  const unsubscribeUrl = buildEmailUnsubscribeUrl(email, "billing.payment-failed");
  const updatePaymentUrl = `${env.NEXT_PUBLIC_APP_URL}/settings/billing`;
  const {
    html,
    text,
    subject: emailSubject,
  } = await emails.renderTemplate("billing.payment-failed", {
    appName: APPS.cozya.name,
    attempt,
    maxAttempts: MAX_DUNNING_ATTEMPTS,
    updatePaymentUrl,
    unsubscribeUrl,
    unsubscribeMailto: getEmailUnsubscribeMailto(),
  });

  await emails.sendEmail({
    to: email,
    category: "billing.payment-failed",
    messageKey: `dunning_${invoiceId}_${attempt}`,
    unsubscribeUrl,
    unsubscribeMailto: getEmailUnsubscribeMailto(),
    userId: subject.id,
    subject: emailSubject,
    html,
    text,
  });
}
