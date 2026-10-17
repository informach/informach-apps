import "server-only";
import { getEnv } from "./env";

/**
 * Links para onde cada coisa tem dono: o Bastidores mostra e leva até lá.
 * Nenhum link carrega e-mail ou dado da pessoa na URL.
 */
export function stripeDashboard(path: string): string {
  const base =
    getEnv().STRIPE_MODE === "prod"
      ? "https://dashboard.stripe.com"
      : "https://dashboard.stripe.com/test";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const stripeLinks = {
  customer: (providerCustomerId: string) => stripeDashboard(`/customers/${providerCustomerId}`),
  subscription: (providerSubscriptionId: string) =>
    stripeDashboard(`/subscriptions/${providerSubscriptionId}`),
  /** `providerEventId` vem como `<app>:evt_...`; o Stripe só conhece a parte `evt_`. */
  event: (providerEventId: string) =>
    stripeDashboard(`/events/${providerEventId.split(":").pop() ?? ""}`),
  payment: (providerPaymentId: string) => stripeDashboard(`/payments/${providerPaymentId}`),
};

export const RAILWAY_PROJECT_URL =
  "https://railway.com/project/f4da4285-5b98-48b5-b03e-5be02f4e7c56?environmentId=174b2cb0-e1cd-410c-8764-d913e3af18d3";

/** Página de erros de um projeto do Sentry, quando a organização está configurada. */
export function sentryIssues(project: string): string | null {
  const org = getEnv().SENTRY_ORG_SLUG;
  if (!org) return null;
  return `https://${org}.sentry.io/projects/${encodeURIComponent(project)}/?query=is%3Aunresolved`;
}
