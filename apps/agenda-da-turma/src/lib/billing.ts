import { logAuditEvent } from "@informach/auth";
import { createBillingService, type SubjectRef } from "@informach/billing";
import { APPS, PRODUCTS } from "@informach/config";
import { db } from "@informach/db";
import { organizations, users } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { eq } from "drizzle-orm";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");

/**
 * Resolves the email used for the Stripe customer record.
 *  - subject.type='user'         → core.users.email
 *  - subject.type='organization' → email of the org's owner member, fallback
 *    to a placeholder (rare path; should be set in onboarding).
 *
 * Throws when the subject cannot be resolved — callers should make sure the
 * subject exists before initiating checkout.
 */
async function resolveSubjectEmail(subject: SubjectRef): Promise<string> {
  if (subject.type === "user") {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, subject.id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new Error(`@informach/agenda-da-turma: user ${subject.id} not found`);
    }
    return row.email;
  }
  // For an org subscription, we want a contact email. organizations table has
  // no `email` column, so we use the placeholder format informach.com.br
  // owner email until product asks for proper org contact metadata.
  // TODO when org metadata grows: read from org.metadata.billingEmail.
  const rows = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, subject.id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`@informach/agenda-da-turma: organization ${subject.id} not found`);
  }
  return `billing+${row.slug}@${new URL(env.NEXT_PUBLIC_APP_URL).hostname}`;
}

export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  db,
  appName: APPS.agendaDaTurma.name,
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  products: PRODUCTS.filter((p) => p.app === APPS.agendaDaTurma.slug),
  organizationsEnabled: true,
  stripeMode,
  resolveSubjectEmail,
  logger,
  // Email integration: webhook handlers fire transactional billing.* emails.
  // The dunning sweeper (`api/jobs/billing-dunning`) does its own send for
  // `billing.payment-failed`; the 4 handlers here cover payment-success,
  // subscription-renewed, subscription-canceled, credits-purchased.
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/billing`,
  buildUnsubscribeUrl: (identifier, category) => {
    const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
  },
  unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
  onAudit: (event) => {
    // Fire-and-forget: audit emit must never block the billing call.
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
