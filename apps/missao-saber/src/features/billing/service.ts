import "server-only";
import {
  AlreadySubscribedError,
  CheckoutPendingError,
  createBillingService,
} from "@informach/billing";
import { isStripePriceIdConfigured, PRODUCTS } from "@informach/config";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { audit, packageLogger } from "@/lib/observability";
import { planChangeMode, planProfileLimit } from "./plan-policy";
import {
  billingDatabase,
  billingEmail,
  billingEventOwner,
  entitlement,
  retainProfilesForSmallerPlan,
  withBillingLifecycle,
  withBillingLifecycleWait,
} from "./repository";

export { planChangeMode } from "./plan-policy";

const prices: Record<string, string> = {
  missao_individual_monthly: env.MISSAO_INDIVIDUAL_MONTHLY_PRICE,
  missao_individual_annual: env.MISSAO_INDIVIDUAL_ANNUAL_PRICE,
  missao_family_monthly: env.MISSAO_FAMILY_MONTHLY_PRICE,
  missao_family_annual: env.MISSAO_FAMILY_ANNUAL_PRICE,
};
export const products = PRODUCTS.filter((product) => product.app === "missao-saber").map(
  (product) => ({
    ...product,
    stripePriceId: {
      ...product.stripePriceId,
      [env.STRIPE_MODE]: prices[product.id] || product.stripePriceId[env.STRIPE_MODE],
    },
  }),
);
export function configuredPrice(productId: string) {
  const product = products.find((p) => p.id === productId);
  return !!product && isStripePriceIdConfigured(product.stripePriceId[env.STRIPE_MODE]);
}
export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
  onAudit: audit,
  logger: packageLogger,
  db: billingDatabase,
  app: "missao-saber",
  appName: "Missão Saber",
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
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/familia`,
});
export async function getAccess(userId: string) {
  const subscription = await entitlement(userId);
  const product = products.find((p) => p.id === subscription?.productId);
  return {
    paid: !!subscription && !!product,
    profileLimit: product?.tier === "family" ? 3 : 1,
    subscription,
    tier: product?.tier ?? "free",
  };
}
export async function checkout(userId: string, productId: string) {
  assertAllowed(
    configuredPrice(productId),
    "BILLING_CONFIG",
    "As assinaturas ainda estão em preparação. A unidade gratuita já pode ser explorada.",
  );
  return withBillingLifecycle(userId, async () => {
    return billing
      .createSubscriptionCheckout({
        subject: { type: "user", id: userId },
        actorId: userId,
        productId,
        successUrl: `${env.NEXT_PUBLIC_APP_URL}/familia?pagamento=recebido`,
        cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/familia`,
      })
      .catch((error: unknown) => {
        if (error instanceof CheckoutPendingError)
          throw new AppError(
            "CHECKOUT_PENDING",
            "Seu pagamento anterior está em confirmação. Aguarde a atualização da assinatura em Família antes de tentar outra compra.",
          );
        if (error instanceof AlreadySubscribedError)
          throw new AppError(
            "ALREADY_SUBSCRIBED",
            "Você já tem uma assinatura. Gerencie seu plano em Família.",
          );
        throw error;
      });
  });
}
export async function changePlan(userId: string, newProductId: string, retainedProfileId?: string) {
  assertAllowed(configuredPrice(newProductId), "BILLING_CONFIG", "Este plano não está disponível.");
  return withBillingLifecycle(userId, async () => {
    const currentSubscription = await entitlement(userId);
    assertAllowed(currentSubscription, "SUBSCRIPTION", "Assinatura ativa não encontrada.");
    const current = products.find((product) => product.id === currentSubscription.productId);
    const target = products.find((product) => product.id === newProductId);
    assertAllowed(current && target, "PLAN", "Plano não encontrado.");
    assertAllowed(current.id !== target.id, "PLAN", "Este já é o seu plano atual.");
    const mode = planChangeMode(current, target);
    const retryingSameSchedule =
      mode === "schedule_at_period_end" &&
      !currentSubscription.cancelAtPeriodEnd &&
      currentSubscription.pendingProductId === target.id;
    assertAllowed(
      (!currentSubscription.pendingProductId &&
        !currentSubscription.pendingPriceId &&
        !currentSubscription.cancelAtPeriodEnd) ||
        retryingSameSchedule,
      "PLAN_CHANGE",
      "Desfaça a alteração agendada antes de escolher outro plano.",
    );
    if (planProfileLimit(target) < planProfileLimit(current) && !retryingSameSchedule)
      await retainProfilesForSmallerPlan(
        userId,
        retainedProfileId ? [retainedProfileId] : [],
        planProfileLimit(target),
      );
    const result = await billing.switchPlan({
      subscriptionId: currentSubscription.id,
      actorId: userId,
      newProductId,
      mode,
    });
    return {
      url: result.paymentActionUrl,
      effective: result.paymentActionUrl
        ? ("payment_required" as const)
        : result.appliedImmediately
          ? ("now" as const)
          : ("period_end" as const),
      appliesAt: result.subscription.cancelAtPeriodEnd?.toISOString() ?? null,
    };
  });
}
export async function reactivate(userId: string) {
  return withBillingLifecycle(userId, async () => {
    const current = await entitlement(userId);
    assertAllowed(
      current?.cancelAtPeriodEnd || current?.pendingProductId,
      "SUBSCRIPTION",
      "Não há alteração agendada.",
    );
    await billing.reactivateSubscription({ subscriptionId: current.id, actorId: userId });
  });
}
export async function closeBillingAndFamily(userId: string, removeData: () => Promise<void>) {
  return withBillingLifecycle(userId, async () => {
    await billing.closeRemoteBillingForSubject({ type: "user", id: userId });
    await removeData();
  });
}
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
export function portal(userId: string) {
  return withBillingLifecycle(userId, () =>
    billing.createPortalSession({
      subject: { type: "user", id: userId },
      returnUrl: `${env.NEXT_PUBLIC_APP_URL}/familia`,
    }),
  );
}
