import { getConfiguredProducts } from "@informach/config";
import { getCollectionApps } from "@informach/config/collections";

export type CompassoPriceConfiguration = {
  STRIPE_MODE: "dev" | "prod";
  COMPASSO_MONTHLY_PRICE: string;
  COMPASSO_ANNUAL_PRICE: string;
  COMPASSO_CREDITS_100_PRICE: string;
  COMPASSO_CREDITS_300_PRICE: string;
  COMPASSO_CREDITS_1000_PRICE: string;
};

/** Deployment identifiers supplement the shared catalog; amounts and policies stay in config. */
export function compassoProducts(env: CompassoPriceConfiguration) {
  return getConfiguredProducts("compasso", env.STRIPE_MODE, env);
}

export function legacyWebProducts(env: {
  STRIPE_MODE: "dev" | "prod";
  legacyPrices: Record<string, string>;
}) {
  return getCollectionApps("compasso").flatMap((app) =>
    getConfiguredProducts(app.slug, env.STRIPE_MODE, env.legacyPrices),
  );
}
