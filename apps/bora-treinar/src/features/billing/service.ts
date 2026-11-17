import "server-only";
import { createBillingService } from "@informach/billing";
import { getConfiguredProducts } from "@informach/config";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { audit, packageLogger } from "@/lib/observability";
import {
  billingDatabase,
  billingEmail,
  billingEventOwner,
  withBillingLifecycle,
  withBillingLifecycleWait,
} from "./repository";

export const products = getConfiguredProducts("bora-treinar", env.STRIPE_MODE, env);
export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
  onAudit: audit,
  logger: packageLogger,
  db: billingDatabase,
  app: "bora-treinar",
  appName: "Bora Treinar",
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  organizationsEnabled: false,
  guardClosedBilling: true,
  managedCheckout: true,
  withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
  stripeMode: env.STRIPE_MODE,
  products,
  resolveSubjectEmail: async (subject) => {
    assertAllowed(subject.type === "user", "SUBJECT", "Assinatura exige uma conta responsável.");
    return billingEmail(subject.id);
  },
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/conta`,
});
export { getGroupAccess } from "./access-repository";
export async function handleBillingEvent(event: Parameters<typeof billing.handleStripeEvent>[0]) {
  const object = (event.payload as { data?: { object?: { customer?: string | { id?: string } } } })
    .data?.object;
  const customerId = typeof object?.customer === "string" ? object.customer : object?.customer?.id;
  const owner = customerId && (await billingEventOwner(customerId));
  if (customerId && !owner)
    return { processed: false, deduped: false, reason: "foreign_or_unknown_customer" };
  return owner
    ? withBillingLifecycleWait(owner, () => billing.handleStripeEvent(event))
    : billing.handleStripeEvent(event);
}
