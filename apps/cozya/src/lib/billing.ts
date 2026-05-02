import { logAuditEvent } from "@informach/auth";
import { createBillingService, type SubjectRef } from "@informach/billing";
import { APPS, PRODUCTS } from "@informach/config";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { eq } from "drizzle-orm";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");

/**
 * Cozya is single-user, so subjects are always users. Resolves email from
 * core.users. Reject organization subjects defensively (the service layer
 * already throws OrganizationsDisabledError, but this keeps the error closer
 * to the source).
 */
async function resolveSubjectEmail(subject: SubjectRef): Promise<string> {
  if (subject.type !== "user") {
    throw new Error(`@informach/cozya: only user subjects are supported, got '${subject.type}'`);
  }
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, subject.id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`@informach/cozya: user ${subject.id} not found`);
  }
  return row.email;
}

export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  db,
  appName: APPS.cozya.name,
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  products: PRODUCTS.filter((p) => p.app === APPS.cozya.slug),
  organizationsEnabled: false,
  stripeMode,
  resolveSubjectEmail,
  logger,
  // Email integration: webhook handlers fire transactional billing.* emails.
  // The dunning sweeper (`api/jobs/billing-dunning`) does its own send for
  // `billing.payment-failed`; the 4 handlers here cover payment-success,
  // subscription-renewed, subscription-canceled, credits-purchased.
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  buildUnsubscribeUrl: (identifier, category) => {
    const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
  },
  unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
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
