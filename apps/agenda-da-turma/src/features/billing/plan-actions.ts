"use server";

import {
  CustomerNotFoundError,
  InvalidProductError,
  SubscriptionRequiredError,
} from "@informach/billing";
import { findProduct, isStripePriceIdConfigured } from "@informach/config";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { CANCEL_REASONS } from "./cancel-reasons";
import { billing } from "./service";

const planProductSchema = z.object({
  productId: z.string().min(1),
});

export const previewPlanChangeAction = action
  .input(planProductSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "billing-preview-plan", max: 20, window: "5m" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const subject = { type: "user" as const, id: userId };
    const subscription = await billing.getSubscription(subject);
    if (!subscription) return err({ code: "NO_SUBSCRIPTION" } as const);

    try {
      const preview = await billing.previewPlanChange({
        subject,
        subscriptionId: subscription.id,
        newProductId: input.productId,
      });
      return ok({
        subtotalCents: preview.subtotalCents,
        prorationCreditCents: preview.prorationCreditCents,
        amountDueCents: preview.amountDueCents,
        currency: preview.currency,
        nextChargeAt: preview.nextChargeAt?.toISOString() ?? null,
      } as const);
    } catch (error) {
      if (error instanceof InvalidProductError) {
        return err({ code: "INVALID_PRODUCT" } as const);
      }
      if (error instanceof CustomerNotFoundError) {
        return err({ code: "NO_CUSTOMER" } as const);
      }
      throw error;
    }
  });

export const switchToPlanAction = action
  .input(planProductSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "billing-switch-plan", max: 5, window: "5m" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const subject = { type: "user" as const, id: userId };
    const subscription = await billing.getSubscription(subject);
    if (!subscription) return err({ code: "NO_SUBSCRIPTION" } as const);

    const current = findProduct(subscription.productId);
    const target = findProduct(input.productId);
    if (!target || target.kind !== "subscription") {
      return err({ code: "INVALID_PRODUCT" } as const);
    }

    const isUpgrade =
      target.interval === "year" && (current?.interval === "month" || current?.interval === "year");
    const isSamePlan = current?.id === target.id && !subscription.cancelAtPeriodEnd;
    if (isSamePlan) return err({ code: "ALREADY_ON_PLAN" } as const);

    const mode = isUpgrade ? "immediate" : "schedule_at_period_end";
    try {
      const result = await billing.switchPlan({
        subscriptionId: subscription.id,
        actorId: userId,
        newProductId: target.id,
        mode,
      });
      return ok({
        appliedImmediately: result.appliedImmediately,
        productId: target.id,
        appliesAt: result.appliedImmediately
          ? null
          : (result.subscription.cancelAtPeriodEnd?.toISOString() ?? null),
        paymentActionUrl: result.paymentActionUrl,
      } as const);
    } catch (error) {
      if (error instanceof InvalidProductError) {
        return err({ code: "INVALID_PRODUCT" } as const);
      }
      throw error;
    }
  });

const cancelSchema = z.object({
  reason: z.enum(CANCEL_REASONS).optional(),
});

export const cancelSubscriptionAction = action
  .input(cancelSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "billing-cancel", max: 5, window: "10m" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const subject = { type: "user" as const, id: userId };
    const subscription = await billing.getSubscription(subject);
    if (!subscription) return err({ code: "NO_SUBSCRIPTION" } as const);

    const updated = await billing.cancelSubscription({
      subscriptionId: subscription.id,
      actorId: userId,
      reason: input.reason,
      atPeriodEnd: true,
    });
    logger.info(
      { userId, subscriptionId: subscription.id, reason: input.reason ?? null },
      "billing.cancel.scheduled",
    );
    return ok({
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd?.toISOString() ?? null,
    } as const);
  });

export const reactivateSubscriptionAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "billing-reactivate", max: 5, window: "10m" })
  .run(async ({ ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const subject = { type: "user" as const, id: userId };
    const subscription = await billing.getSubscription(subject);
    if (!subscription) return err({ code: "NO_SUBSCRIPTION" } as const);

    await billing.reactivateSubscription({ subscriptionId: subscription.id, actorId: userId });
    return ok({ ok: true } as const);
  });

export const purchaseCreditPackAction = action
  .input(planProductSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "billing-credit-pack", max: 10, window: "5m" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");
    const product = findProduct(input.productId);
    if (!product || product.kind !== "credit_pack") {
      return err({ code: "INVALID_PRODUCT" } as const);
    }
    const priceId = product.stripePriceId[stripeMode];
    if (!isStripePriceIdConfigured(priceId)) {
      return err({ code: "PACK_NOT_CONFIGURED" } as const);
    }

    try {
      const result = await billing.createCreditPackCheckout({
        subject: { type: "user", id: userId },
        actorId: userId,
        productId: product.id,
        successUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?credits=success`,
        cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?credits=canceled`,
      });
      return ok({ url: result.url } as const);
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return err({ code: "NO_PRO_SUBSCRIPTION" } as const);
      }
      if (error instanceof InvalidProductError) {
        return err({ code: "INVALID_PRODUCT" } as const);
      }
      throw error;
    }
  });
