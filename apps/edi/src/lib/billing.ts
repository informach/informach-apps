import { logAuditEvent } from "@informach/auth";
import { createBillingService } from "@informach/billing";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { billingConfigured, ediProducts } from "../features/billing/catalog";
import { withBillingLifecycle } from "../features/billing/lifecycle";
import { emailUnsubscribeUrl, getEmails } from "./emails";
import { getEnv } from "./env";
import { packageLogger, reportOperationalError } from "./observability";

let instance: ReturnType<typeof createBillingService> | undefined;
export function getBilling() {
  if (instance) return instance;
  const env = getEnv();
  if (!billingConfigured(env)) throw new Error("billing_not_configured");
  instance = createBillingService({
    provider: "stripe",
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID,
    db,
    app: "edi",
    appName: "Suíte Edi",
    publicAppUrl: env.NEXT_PUBLIC_APP_URL,
    products: ediProducts(env),
    organizationsEnabled: false,
    stripeMode: env.STRIPE_MODE,
    logger: packageLogger,
    guardClosedBilling: true,
    managedCheckout: true,
    withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
    sendEmail: getEmails().sendEmail,
    renderTemplate: getEmails().renderTemplate,
    manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/conta`,
    buildUnsubscribeUrl: emailUnsubscribeUrl,
    unsubscribeMailto: "unsubscribe@informach.com.br",
    resolveSubjectEmail: async (subject) => {
      const user = (
        await db.select({ email: users.email }).from(users).where(eq(users.id, subject.id)).limit(1)
      )[0];
      if (!user) throw new Error("Unknown billing subject");
      return user.email;
    },
    onAudit: (event) => {
      void logAuditEvent(event.eventType, event.actorId, event.payload).catch((error) =>
        reportOperationalError("billing.audit_persistence_failed", error, {
          eventType: event.eventType,
          actorId: event.actorId,
          payloadKeys: Object.keys(event.payload),
        }),
      );
    },
  });
  return instance;
}
export function getPaymentReader() {
  return createStripePaymentFactReader({ secretKey: getEnv().STRIPE_SECRET_KEY });
}
export async function createSuiteCheckout(userId: string, productId: string) {
  return withBillingLifecycle(userId, async () => {
    const env = getEnv();
    await getPaymentReader().verifyCatalog(
      ediProducts(env),
      env.STRIPE_MODE,
      env.STRIPE_PORTAL_CONFIGURATION_ID,
    );
    return getBilling().createSubscriptionCheckout({
      subject: { type: "user", id: userId },
      actorId: userId,
      productId,
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/conta?checkout=success`,
      cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/conta?checkout=canceled`,
    });
  });
}
