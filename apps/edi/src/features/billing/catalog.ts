import { isStripePriceIdConfigured, PRODUCTS } from "@informach/config";
import type { EdiEnv } from "../../lib/env";
export function ediProducts(
  env: Pick<
    EdiEnv,
    | "EDI_MONTHLY_PRICE_DEV"
    | "EDI_MONTHLY_PRICE_PROD"
    | "EDI_ANNUAL_PRICE_DEV"
    | "EDI_ANNUAL_PRICE_PROD"
  >,
) {
  return PRODUCTS.filter((product) => product.app === "edi").map((product) => ({
    ...product,
    stripePriceId:
      product.interval === "month"
        ? { dev: env.EDI_MONTHLY_PRICE_DEV, prod: env.EDI_MONTHLY_PRICE_PROD }
        : { dev: env.EDI_ANNUAL_PRICE_DEV, prod: env.EDI_ANNUAL_PRICE_PROD },
  }));
}
export function billingConfigured(env: EdiEnv) {
  return (
    env.EDI_BILLING_ENABLED === "true" &&
    ediProducts(env).every((product) =>
      isStripePriceIdConfigured(product.stripePriceId[env.STRIPE_MODE]),
    )
  );
}
