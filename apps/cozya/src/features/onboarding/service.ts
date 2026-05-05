import { AlreadySubscribedError, InvalidProductError } from "@informach/billing";
import type { BillingCycle } from "@/features/billing/plans-content";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const PRO_PRODUCT_ID_BY_CYCLE: Record<BillingCycle, string> = {
  monthly: "cozya_pro_monthly",
  annual: "cozya_pro_annual",
};

export type StartProCheckoutError =
  | { code: "PRO_NOT_CONFIGURED" }
  | { code: "ALREADY_SUBSCRIBED" }
  | { code: "CHECKOUT_FAILED" };

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
      actorId: input.userId,
      productId,
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard?welcome=1`,
      cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/choose-plan?cycle=${input.cycle === "annual" ? "anual" : "mensal"}`,
    });
    return { ok: true, value: { url: result.url } };
  } catch (error) {
    if (error instanceof AlreadySubscribedError) {
      logger.info(
        { userId: input.userId, productId, cycle: input.cycle },
        "onboarding.checkout.already_subscribed",
      );
      return { ok: false, error: { code: "ALREADY_SUBSCRIBED" } };
    }
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
