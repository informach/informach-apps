import "server-only";
import { createCompassoCommerce } from "@informach/billing/compasso-commerce";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { createStripeFutureContractProvider } from "@informach/billing/providers/stripe-future-contract";
import { createStripeLegacyDeferralProvider } from "@informach/billing/providers/stripe-legacy-deferral";
import { createStripePlanSchedules } from "@informach/billing/providers/stripe-plans";
import { db } from "@informach/db";
import { getEnv } from "./env";
import { reportOperationalError } from "./observability";
import { compassoProducts, legacyWebProducts } from "./products";

let cached: ReturnType<typeof createRuntime> | undefined;
function createRuntime() {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) throw new Error("Compasso financial maintenance is not configured");
  const products = compassoProducts(env);
  const legacyProducts = legacyWebProducts(env);
  const providerClient = createStripeProvider({
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    appName: "compasso",
  });
  const reader = createStripePaymentFactReader({ secretKey: env.STRIPE_SECRET_KEY });
  // Successful catalog checks are briefly cached; rejected checks are never retained.
  let catalogValidUntil = 0;
  let catalogCheck: Promise<void> | undefined;
  async function verifyCatalog() {
    if (Date.now() < catalogValidUntil) return;
    catalogCheck ??= reader
      .verifyCompassoCatalog(products, env.STRIPE_MODE, env.STRIPE_PORTAL_CONFIGURATION_ID)
      .then(() => {
        catalogValidUntil = Date.now() + 60_000;
      })
      .finally(() => {
        catalogCheck = undefined;
      });
    await catalogCheck;
  }
  const deps = { db, providerClient, products, mode: env.STRIPE_MODE, publicUrl: env.origin };
  const commerceDeps = {
    ...deps,
    reader,
    plans: createStripePlanSchedules({ secretKey: env.STRIPE_SECRET_KEY }),
    verifyCatalog,
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID,
    onError: () => reportOperationalError("billing.reconciliation.failed"),
  };
  const commerce = createCompassoCommerce(commerceDeps);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: env.STRIPE_SECRET_KEY,
    mode: env.STRIPE_MODE,
  });
  const deferralProvider = createStripeLegacyDeferralProvider({
    secretKey: env.STRIPE_SECRET_KEY,
    mode: env.STRIPE_MODE,
  });
  // The coordination reads the payer's Compasso price and refreshes the
  // contributed historical contracts, so it needs both catalogs.
  const coordinationDeps = {
    db,
    products: [...products, ...legacyProducts],
    mode: env.STRIPE_MODE,
    providerClient,
    deferralProvider,
    futureProvider,
  };
  return {
    ...deps,
    reader,
    legacyProducts,
    commerce,
    commerceDeps,
    verifyCatalog,
    futureProvider,
    coordinationDeps,
  };
}
export function getBilling() {
  if (!getEnv().COMPASSO_BILLING_ENABLED) throw new Error("Compasso billing is not enabled");
  return getBillingMaintenance();
}
/** Existing obligations keep reconciling when admission of new purchases is off. */
export function getBillingMaintenance() {
  cached ??= createRuntime();
  return cached;
}
