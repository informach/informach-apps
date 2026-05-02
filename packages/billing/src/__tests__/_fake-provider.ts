import { vi } from "vitest";
import { WebhookSignatureError } from "../errors";
import type {
  BillingProviderClient,
  ProviderCancelSubscriptionInput,
  ProviderCheckoutInput,
  ProviderCheckoutSession,
  ProviderCustomer,
  ProviderPortalInput,
  ProviderPortalSession,
  ProviderSubscriptionSummary,
  ProviderUpdateSubscriptionInput,
  ProviderWebhookEvent,
} from "../providers/types";

export type FakeProviderConfig = {
  customerIdSequence?: string[];
  /** Return value for retrieveCustomer. Defaults to null. */
  retrieveResult?: ProviderCustomer | null;
  checkoutSession?: ProviderCheckoutSession;
  portalSession?: ProviderPortalSession;
  webhookEvents?: Map<string, ProviderWebhookEvent>;
  /** When true, verifyWebhookSignature throws WebhookSignatureError. */
  failVerify?: boolean;
  /** Return values for cancel/update subscription. */
  subscriptionSummary?: ProviderSubscriptionSummary;
};

export function createFakeProvider(config: FakeProviderConfig = {}) {
  const customerIds = [...(config.customerIdSequence ?? ["cus_test_1"])];
  const createCustomerCalls: Array<{ email: string; subject: { type: string; id: string } }> = [];

  const provider: BillingProviderClient = {
    name: "stripe",

    createCustomer: vi.fn(async (input) => {
      createCustomerCalls.push({
        email: input.email,
        subject: { type: input.subject.type, id: input.subject.id },
      });
      const id = customerIds.shift() ?? `cus_auto_${createCustomerCalls.length}`;
      return {
        id,
        email: input.email,
        metadata: {
          ...(input.metadata ?? {}),
          subject_type: input.subject.type,
          subject_id: input.subject.id,
        },
      };
    }),

    retrieveCustomer: vi.fn(async () => config.retrieveResult ?? null),

    createCheckoutSession: vi.fn(async (_input: ProviderCheckoutInput) => {
      return (
        config.checkoutSession ?? {
          id: "cs_test_1",
          url: "https://checkout.stripe.com/test",
        }
      );
    }),

    createPortalSession: vi.fn(async (_input: ProviderPortalInput) => {
      return config.portalSession ?? { url: "https://billing.stripe.com/test" };
    }),

    cancelSubscription: vi.fn(async (input: ProviderCancelSubscriptionInput) => {
      return (
        config.subscriptionSummary ?? {
          id: input.providerSubscriptionId,
          status: input.atPeriodEnd === false ? "canceled" : "active",
          cancelAtPeriodEnd: input.atPeriodEnd !== false,
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        }
      );
    }),

    updateSubscription: vi.fn(async (input: ProviderUpdateSubscriptionInput) => {
      return (
        config.subscriptionSummary ?? {
          id: input.providerSubscriptionId,
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        }
      );
    }),

    retrieveSubscription: vi.fn(async (providerSubscriptionId: string) => {
      return (
        config.subscriptionSummary ?? {
          id: providerSubscriptionId,
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        }
      );
    }),

    verifyWebhookSignature: vi.fn((rawBody, _signature) => {
      if (config.failVerify) {
        throw new WebhookSignatureError("forced failure");
      }
      const map = config.webhookEvents;
      if (map?.has(rawBody)) {
        const ev = map.get(rawBody);
        if (ev) return ev;
      }
      return {
        id: "evt_test_1",
        type: "checkout.session.completed",
        payload: {},
      };
    }),
  };

  return { provider, createCustomerCalls };
}
