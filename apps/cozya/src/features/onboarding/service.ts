import { InvalidProductError } from "@informach/billing";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { BillingCycle } from "./plans-content";

const PRO_PRODUCT_ID_BY_CYCLE: Record<BillingCycle, string> = {
  monthly: "cozya_pro_monthly",
  annual: "cozya_pro_annual",
};

export type StartProCheckoutError = { code: "PRO_NOT_CONFIGURED" } | { code: "CHECKOUT_FAILED" };

export type StartProCheckoutResult =
  | { ok: true; value: { url: string } }
  | { ok: false; error: StartProCheckoutError };

export async function startProCheckout(input: {
  userId: string;
  cycle: BillingCycle;
}): Promise<StartProCheckoutResult> {
  const productId = PRO_PRODUCT_ID_BY_CYCLE[input.cycle];
  try {
    const result = await billing.createSubscriptionCheckout({
      subject: { type: "user", id: input.userId },
      productId,
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard?welcome=1`,
      cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/choose-plan?cycle=${input.cycle === "annual" ? "anual" : "mensal"}`,
    });
    return { ok: true, value: { url: result.url } };
  } catch (error) {
    if (error instanceof InvalidProductError) {
      logger.warn({ productId, cycle: input.cycle }, "onboarding.checkout.pro_not_configured");
      return { ok: false, error: { code: "PRO_NOT_CONFIGURED" } };
    }
    logger.error(
      { productId, cycle: input.cycle, error: String(error) },
      "onboarding.checkout.failed",
    );
    return { ok: false, error: { code: "CHECKOUT_FAILED" } };
  }
}
