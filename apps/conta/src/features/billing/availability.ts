type BillingConfiguration = {
  COMPASSO_BILLING_ENABLED: boolean;
  STRIPE_SECRET_KEY: string;
  STRIPE_PORTAL_CONFIGURATION_ID: string;
};

/** Admission of new charges is distinct from servicing an existing contract. */
export function billingAvailability(env: BillingConfiguration, activeParticipation: boolean) {
  const maintenance = Boolean(env.STRIPE_SECRET_KEY);
  const changes = maintenance && activeParticipation;
  const sales = changes && env.COMPASSO_BILLING_ENABLED;
  return {
    subscribe: sales,
    "buy-credits": sales,
    "resume-purchase": sales,
    "restore-renewal": sales,
    "change-plan": sales,
    "cancel-purchase": changes,
    "cancel-subscription": changes,
    "cancel-plan-change": changes,
    refresh: maintenance,
    portal: maintenance && env.STRIPE_PORTAL_CONFIGURATION_ID.startsWith("bpc_"),
  };
}
