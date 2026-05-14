import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("server-only", () => ({}));

// Factory de teste pro action builder — bypassa auth/rate-limit/audit do
// `@/lib/action` real, que já é coberto em packages/auth. Aqui só queremos
// invocar o handler com input validado + ctx forjado. Cada chamada de
// `.input(...)` cria um config fresh pra evitar bleed entre chains.
vi.mock("@/lib/action", () => {
  type Handler = (args: {
    input: unknown;
    ctx: { actor: { id: string } | null };
  }) => Promise<unknown>;
  type ChainConfig = { schema?: z.ZodTypeAny };

  function chain(config: ChainConfig) {
    return {
      input(schema: z.ZodTypeAny) {
        return chain({ ...config, schema });
      },
      auth() {
        return chain(config);
      },
      rateLimit() {
        return chain(config);
      },
      audit() {
        return chain(config);
      },
      run(handler: Handler) {
        return async (input: unknown, ctxOverride?: { actor: { id: string } | null }) => {
          const parsed = config.schema ? config.schema.parse(input) : input;
          const ctx: { actor: { id: string } | null } = ctxOverride ?? {
            actor: { id: "user-1" },
          };
          return handler({ input: parsed, ctx });
        };
      },
    };
  }

  return {
    action: chain({}),
    ok: <T>(value: T) => ({ ok: true as const, value }),
    err: <E>(error: E) => ({ ok: false as const, error }),
  };
});

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "http://localhost:3001",
    NODE_ENV: "test",
    STRIPE_MODE: "dev" as const,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const billingService = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  previewPlanChange: vi.fn(),
  switchPlan: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  createCreditPackCheckout: vi.fn(),
  createPortalSession: vi.fn(),
}));

vi.mock("./service", () => ({ billing: billingService }));

// Erros precisam ser classes reais pra `instanceof` funcionar nos handlers.
// Hoisted pra contornar o top-level hoisting do `vi.mock` (ReferenceError
// "cannot access X before initialization" se declarado fora).
const errorClasses = vi.hoisted(() => {
  class CustomerNotFoundError extends Error {
    constructor(msg = "no customer") {
      super(msg);
      this.name = "CustomerNotFoundError";
    }
  }
  class InvalidProductError extends Error {
    constructor(msg = "bad product") {
      super(msg);
      this.name = "InvalidProductError";
    }
  }
  class SubscriptionRequiredError extends Error {
    constructor(msg = "needs pro") {
      super(msg);
      this.name = "SubscriptionRequiredError";
    }
  }
  return { CustomerNotFoundError, InvalidProductError, SubscriptionRequiredError };
});

const { CustomerNotFoundError, InvalidProductError, SubscriptionRequiredError } = errorClasses;

vi.mock("@informach/billing", () => ({
  CustomerNotFoundError: errorClasses.CustomerNotFoundError,
  InvalidProductError: errorClasses.InvalidProductError,
  SubscriptionRequiredError: errorClasses.SubscriptionRequiredError,
}));

type FakeProduct = {
  id: string;
  kind: "subscription" | "credit_pack";
  interval?: "month" | "year";
  stripePriceId: { dev: string; prod: string };
};

const PRODUCTS = vi.hoisted<Record<string, FakeProduct>>(() => ({
  agenda_da_turma_credits_10: {
    id: "agenda_da_turma_credits_10",
    kind: "credit_pack",
    stripePriceId: { dev: "price_real_dev_10", prod: "price_real_prod_10" },
  },
  agenda_da_turma_credits_placeholder: {
    id: "agenda_da_turma_credits_placeholder",
    kind: "credit_pack",
    stripePriceId: { dev: "price_TODO_pack", prod: "price_TODO_pack" },
  },
  agenda_da_turma_pro_monthly: {
    id: "agenda_da_turma_pro_monthly",
    kind: "subscription",
    interval: "month",
    stripePriceId: { dev: "price_pro_m_dev", prod: "price_pro_m_prod" },
  },
  agenda_da_turma_pro_annual: {
    id: "agenda_da_turma_pro_annual",
    kind: "subscription",
    interval: "year",
    stripePriceId: { dev: "price_pro_a_dev", prod: "price_pro_a_prod" },
  },
}));

vi.mock("@informach/config", () => ({
  findProduct: (id: string) => PRODUCTS[id] ?? null,
  isStripePriceIdConfigured: (priceId: string) => !priceId.startsWith("price_TODO_"),
}));

import { createBillingPortalSessionAction } from "./actions";
import {
  cancelSubscriptionAction,
  previewPlanChangeAction,
  purchaseCreditPackAction,
  reactivateSubscriptionAction,
  switchToPlanAction,
} from "./plan-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createBillingPortalSessionAction", () => {
  it("retorna UNAUTHORIZED quando não há actor", async () => {
    const result = (await (
      createBillingPortalSessionAction as unknown as (
        input: unknown,
        ctxOverride?: { actor: { id: string } | null },
      ) => Promise<unknown>
    )({}, { actor: null })) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(billingService.createPortalSession).not.toHaveBeenCalled();
  });

  it("retorna NO_CUSTOMER quando billing lança CustomerNotFoundError", async () => {
    billingService.createPortalSession.mockRejectedValueOnce(new CustomerNotFoundError());
    const result = (await (
      createBillingPortalSessionAction as unknown as (input: unknown) => Promise<unknown>
    )({})) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_CUSTOMER");
  });

  it("propaga erro inesperado (não-CustomerNotFoundError)", async () => {
    billingService.createPortalSession.mockRejectedValueOnce(new Error("network"));
    await expect(
      (createBillingPortalSessionAction as unknown as (input: unknown) => Promise<unknown>)({}),
    ).rejects.toThrow("network");
  });

  it("retorna URL no happy path", async () => {
    billingService.createPortalSession.mockResolvedValueOnce({
      url: "https://billing.stripe.com/p/session_abc",
    });
    const result = (await (
      createBillingPortalSessionAction as unknown as (input: unknown) => Promise<unknown>
    )({})) as { ok: boolean; value?: { url: string } };
    expect(result.ok).toBe(true);
    expect(result.value?.url).toBe("https://billing.stripe.com/p/session_abc");
    expect(billingService.createPortalSession).toHaveBeenCalledWith({
      subject: { type: "user", id: "user-1" },
      returnUrl: "http://localhost:3001/settings/billing",
    });
  });
});

describe("purchaseCreditPackAction", () => {
  it("retorna UNAUTHORIZED quando actor ausente", async () => {
    const result = (await (
      purchaseCreditPackAction as unknown as (
        input: unknown,
        ctxOverride?: { actor: { id: string } | null },
      ) => Promise<unknown>
    )({ productId: "agenda_da_turma_credits_10" }, { actor: null })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(billingService.createCreditPackCheckout).not.toHaveBeenCalled();
  });

  it("rejeita INVALID_PRODUCT quando productId não existe", async () => {
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "ghost-product" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_PRODUCT");
  });

  it("rejeita INVALID_PRODUCT quando produto não é credit_pack", async () => {
    // pro_monthly é subscription, não credit_pack — action recusa.
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_pro_monthly" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_PRODUCT");
  });

  it("rejeita PACK_NOT_CONFIGURED quando priceId é placeholder", async () => {
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_credits_placeholder" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PACK_NOT_CONFIGURED");
    expect(billingService.createCreditPackCheckout).not.toHaveBeenCalled();
  });

  it("retorna NO_PRO_SUBSCRIPTION quando service lança SubscriptionRequiredError", async () => {
    billingService.createCreditPackCheckout.mockRejectedValueOnce(new SubscriptionRequiredError());
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_credits_10" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_PRO_SUBSCRIPTION");
  });

  it("retorna INVALID_PRODUCT quando service lança InvalidProductError", async () => {
    billingService.createCreditPackCheckout.mockRejectedValueOnce(new InvalidProductError());
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_credits_10" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_PRODUCT");
  });

  it("retorna URL do checkout no happy path", async () => {
    billingService.createCreditPackCheckout.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/c/pay/cs_abc",
    });
    const result = (await (
      purchaseCreditPackAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_credits_10" })) as {
      ok: boolean;
      value?: { url: string };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.url).toBe("https://checkout.stripe.com/c/pay/cs_abc");
    expect(billingService.createCreditPackCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { type: "user", id: "user-1" },
        productId: "agenda_da_turma_credits_10",
        successUrl: "http://localhost:3001/settings/billing?credits=success",
        cancelUrl: "http://localhost:3001/settings/billing?credits=canceled",
      }),
    );
  });
});

describe("previewPlanChangeAction", () => {
  it("retorna NO_SUBSCRIPTION quando user não tem assinatura", async () => {
    billingService.getSubscription.mockResolvedValueOnce(null);
    const result = (await (
      previewPlanChangeAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_pro_annual" })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_SUBSCRIPTION");
    expect(billingService.previewPlanChange).not.toHaveBeenCalled();
  });

  it("retorna preview com proration no happy path", async () => {
    billingService.getSubscription.mockResolvedValueOnce({
      id: "sub_1",
      productId: "agenda_da_turma_pro_monthly",
      cancelAtPeriodEnd: null,
    });
    const nextCharge = new Date("2027-01-01T00:00:00Z");
    billingService.previewPlanChange.mockResolvedValueOnce({
      subtotalCents: 19900,
      prorationCreditCents: -500,
      amountDueCents: 19400,
      currency: "brl",
      nextChargeAt: nextCharge,
    });
    const result = (await (
      previewPlanChangeAction as unknown as (input: unknown) => Promise<unknown>
    )({ productId: "agenda_da_turma_pro_annual" })) as {
      ok: boolean;
      value?: {
        subtotalCents: number;
        amountDueCents: number;
        nextChargeAt: string | null;
      };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.amountDueCents).toBe(19400);
    expect(result.value?.nextChargeAt).toBe(nextCharge.toISOString());
  });
});

describe("switchToPlanAction", () => {
  beforeEach(() => {
    billingService.getSubscription.mockResolvedValue({
      id: "sub_1",
      productId: "agenda_da_turma_pro_monthly",
      cancelAtPeriodEnd: null,
    });
  });

  it("rejeita ALREADY_ON_PLAN quando target == current e não está cancelando", async () => {
    const result = (await (switchToPlanAction as unknown as (input: unknown) => Promise<unknown>)({
      productId: "agenda_da_turma_pro_monthly",
    })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALREADY_ON_PLAN");
    expect(billingService.switchPlan).not.toHaveBeenCalled();
  });

  it("aplica imediatamente em upgrade mensal → anual", async () => {
    billingService.switchPlan.mockResolvedValueOnce({
      appliedImmediately: true,
      subscription: { cancelAtPeriodEnd: null },
      paymentActionUrl: null,
    });
    const result = (await (switchToPlanAction as unknown as (input: unknown) => Promise<unknown>)({
      productId: "agenda_da_turma_pro_annual",
    })) as {
      ok: boolean;
      value?: { appliedImmediately: boolean; productId: string };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.appliedImmediately).toBe(true);
    expect(billingService.switchPlan).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "immediate" }),
    );
  });

  it("agenda no fim do período em downgrade anual → mensal", async () => {
    billingService.getSubscription.mockResolvedValueOnce({
      id: "sub_1",
      productId: "agenda_da_turma_pro_annual",
      cancelAtPeriodEnd: null,
    });
    billingService.switchPlan.mockResolvedValueOnce({
      appliedImmediately: false,
      subscription: { cancelAtPeriodEnd: new Date("2027-06-01T00:00:00Z") },
      paymentActionUrl: null,
    });
    const result = (await (switchToPlanAction as unknown as (input: unknown) => Promise<unknown>)({
      productId: "agenda_da_turma_pro_monthly",
    })) as {
      ok: boolean;
      value?: { appliedImmediately: boolean; appliesAt: string | null };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.appliedImmediately).toBe(false);
    expect(result.value?.appliesAt).toBe("2027-06-01T00:00:00.000Z");
    expect(billingService.switchPlan).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "schedule_at_period_end" }),
    );
  });
});

describe("cancelSubscriptionAction", () => {
  it("retorna NO_SUBSCRIPTION quando não há sub", async () => {
    billingService.getSubscription.mockResolvedValueOnce(null);
    const result = (await (
      cancelSubscriptionAction as unknown as (input: unknown) => Promise<unknown>
    )({})) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_SUBSCRIPTION");
  });

  it("agenda cancelamento ao final do período com cancelAtPeriodEnd serializado", async () => {
    billingService.getSubscription.mockResolvedValueOnce({ id: "sub_1" });
    const periodEnd = new Date("2026-08-15T00:00:00Z");
    billingService.cancelSubscription.mockResolvedValueOnce({
      cancelAtPeriodEnd: periodEnd,
    });
    const result = (await (
      cancelSubscriptionAction as unknown as (input: unknown) => Promise<unknown>
    )({ reason: "too_expensive" })) as {
      ok: boolean;
      value?: { cancelAtPeriodEnd: string | null };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.cancelAtPeriodEnd).toBe(periodEnd.toISOString());
    expect(billingService.cancelSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_1",
        actorId: "user-1",
        reason: "too_expensive",
        atPeriodEnd: true,
      }),
    );
  });
});

describe("reactivateSubscriptionAction", () => {
  it("retorna NO_SUBSCRIPTION quando não há sub", async () => {
    billingService.getSubscription.mockResolvedValueOnce(null);
    const result = (await (
      reactivateSubscriptionAction as unknown as (input: unknown) => Promise<unknown>
    )({})) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_SUBSCRIPTION");
  });

  it("chama billing.reactivateSubscription no happy path", async () => {
    billingService.getSubscription.mockResolvedValueOnce({ id: "sub_1" });
    billingService.reactivateSubscription.mockResolvedValueOnce(undefined);
    const result = (await (
      reactivateSubscriptionAction as unknown as (input: unknown) => Promise<unknown>
    )({})) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(billingService.reactivateSubscription).toHaveBeenCalledWith({
      subscriptionId: "sub_1",
      actorId: "user-1",
    });
  });
});
