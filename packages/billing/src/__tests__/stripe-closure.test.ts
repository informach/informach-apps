import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createStripeProvider } from "../providers/stripe";

function setup(failExpiry = false) {
  const expired: string[] = [];
  const canceled: string[] = [];
  const client = {
    checkout: {
      sessions: {
        list: vi.fn((_input: unknown) =>
          (async function* () {
            for (let i = 0; i < 107; i++) yield { id: `cs_${i}` };
          })(),
        ),
        expire: vi.fn(async (id: string) => {
          if (failExpiry) throw new Error("checkout already complete");
          expired.push(id);
        }),
      },
    },
    subscriptions: {
      list: vi.fn((_input: unknown) =>
        (async function* () {
          yield { id: "sub_unprojected", status: "active" };
          yield { id: "sub_pending", status: "incomplete" };
          yield { id: "sub_old", status: "canceled" };
        })(),
      ),
      cancel: vi.fn(async (id: string) => {
        canceled.push(id);
      }),
    },
  };
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "test",
    client: client as unknown as Stripe,
  });
  return { provider, client, expired, canceled };
}
describe("provider closure", () => {
  it("expires the full checkout iterator and cancels remote subscriptions without relying on webhooks", async () => {
    const { provider, client, expired, canceled } = setup();
    const result = await provider.closeCustomerSubscriptions?.("cus_app_only");
    expect(expired).toHaveLength(107);
    expect(canceled).toEqual(["sub_unprojected", "sub_pending"]);
    expect(result).toEqual({
      expired: 107,
      canceled: 2,
      subscriptionIds: ["sub_unprojected", "sub_pending", "sub_old"],
    });
    expect(client.checkout.sessions.list).toHaveBeenCalledWith({
      customer: "cus_app_only",
      status: "open",
      limit: 100,
    });
    expect(client.subscriptions.list).toHaveBeenCalledWith({
      customer: "cus_app_only",
      status: "all",
      limit: 100,
    });
    expect(client.subscriptions.cancel).toHaveBeenCalledWith("sub_unprojected", {
      invoice_now: false,
      prorate: false,
    });
  });
  it("fails closed when checkout completion races with expiry, allowing a full retry", async () => {
    const { provider, client } = setup(true);
    await expect(provider.closeCustomerSubscriptions?.("cus_app_only")).rejects.toThrow(
      "checkout already complete",
    );
    expect(client.subscriptions.list).not.toHaveBeenCalled();
  });
});
