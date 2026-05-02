import { describe, expect, it, vi } from "vitest";
import { CustomerNotFoundError, OrganizationsDisabledError } from "../errors";
import {
  cancelBillingForSubject,
  cancelSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  type SubscriptionsDeps,
} from "../subscriptions";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const userSubject = { type: "user" as const, id: "user-1" };
const orgSubject = { type: "organization" as const, id: "org-1" };

function makeDeps(overrides: Partial<SubscriptionsDeps> = {}): SubscriptionsDeps {
  const { db } = createFakeDb();
  const { provider } = createFakeProvider();
  return {
    db: db as never,
    provider: "stripe",
    providerClient: provider,
    organizationsEnabled: true,
    onAudit: vi.fn(),
    ...overrides,
  };
}

const sampleSubRow = {
  id: "sub-row-1",
  customerId: "customer-row-1",
  provider: "stripe",
  providerSubscriptionId: "sub_test_1",
  productId: "agenda_pro_monthly",
  providerPriceId: "price_dev_sub",
  status: "active",
  currentPeriodStart: new Date("2026-04-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-05-01T00:00:00Z"),
  cancelAtPeriodEnd: null,
  canceledAt: null,
  trialEnd: null,
  metadata: {},
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

describe("getSubscription / listSubscriptions", () => {
  it("returns null when subject has no customer", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never });
    const result = await getSubscription(deps, userSubject);
    expect(result).toBeNull();
  });

  it("returns the active-ish subscription when present", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [{ id: "customer-row-1" }],
        [sampleSubRow],
      ],
    });
    const deps = makeDeps({ db: db as never });
    const result = await getSubscription(deps, userSubject);
    expect(result?.id).toBe("sub-row-1");
  });

  it("rejects organization subject when organizationsEnabled=false", async () => {
    const deps = makeDeps({ organizationsEnabled: false });
    await expect(getSubscription(deps, orgSubject)).rejects.toThrow(OrganizationsDisabledError);
  });

  it("listSubscriptions returns [] when subject has no customer", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never });
    expect(await listSubscriptions(deps, userSubject)).toEqual([]);
  });
});

describe("cancelSubscription", () => {
  it("calls provider with atPeriodEnd=true by default and updates row", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      selectQueue: [[sampleSubRow]],
      updateResult: [{ ...sampleSubRow, cancelAtPeriodEnd: new Date("2026-05-01T00:00:00Z") }],
    });
    const { provider } = createFakeProvider();
    const deps = makeDeps({ db: db as never, providerClient: provider, onAudit });
    const result = await cancelSubscription(deps, { subscriptionId: "sub-row-1" });
    expect(provider.cancelSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: "sub_test_1", atPeriodEnd: undefined }),
    );
    expect(result.id).toBe("sub-row-1");
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.subscription_canceled",
        payload: expect.objectContaining({ atPeriodEnd: true }),
      }),
    );
  });

  it("calls provider with atPeriodEnd=false for immediate cancel and marks row canceled", async () => {
    const { db } = createFakeDb({
      selectQueue: [[sampleSubRow]],
      updateResult: [{ ...sampleSubRow, status: "canceled", canceledAt: new Date() }],
    });
    const { provider } = createFakeProvider();
    const deps = makeDeps({ db: db as never, providerClient: provider });
    const result = await cancelSubscription(deps, {
      subscriptionId: "sub-row-1",
      atPeriodEnd: false,
    });
    expect(provider.cancelSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ atPeriodEnd: false }),
    );
    expect(result.status).toBe("canceled");
  });

  it("throws when subscription row is not found locally", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never });
    await expect(
      cancelSubscription(deps, { subscriptionId: "missing" }),
    ).rejects.toThrow(CustomerNotFoundError);
  });
});

describe("updateSubscription", () => {
  it("calls provider with new price and prorationBehavior, updates local row", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      selectQueue: [[sampleSubRow]],
      updateResult: [{ ...sampleSubRow, providerPriceId: "price_new" }],
    });
    const { provider } = createFakeProvider();
    const deps = makeDeps({ db: db as never, providerClient: provider, onAudit });
    const result = await updateSubscription(deps, {
      subscriptionId: "sub-row-1",
      newPriceId: "price_new",
      prorationBehavior: "always_invoice",
    });
    expect(provider.updateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSubscriptionId: "sub_test_1",
        newPriceId: "price_new",
        prorationBehavior: "always_invoice",
      }),
    );
    expect(result.providerPriceId).toBe("price_new");
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.subscription_updated",
        payload: expect.objectContaining({ newPriceId: "price_new" }),
      }),
    );
  });
});

describe("cancelBillingForSubject (LGPD hook)", () => {
  it("returns zeros when subject has no customer (no-op)", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never });
    const result = await cancelBillingForSubject(deps, userSubject);
    expect(result).toEqual({ canceled: 0, failed: 0 });
  });

  it("immediate-cancels every active subscription and counts results", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [{ id: "customer-row-1" }],
        [
          { id: "sub-1", providerSubscriptionId: "sub_test_1" },
          { id: "sub-2", providerSubscriptionId: "sub_test_2" },
        ],
      ],
    });
    const { provider } = createFakeProvider();
    const deps = makeDeps({ db: db as never, providerClient: provider });
    const result = await cancelBillingForSubject(deps, userSubject);
    expect(result).toEqual({ canceled: 2, failed: 0 });
    expect(provider.cancelSubscription).toHaveBeenCalledTimes(2);
    expect(provider.cancelSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ atPeriodEnd: false }),
    );
  });

  it("counts failures when provider rejects but does not abort the loop", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [{ id: "customer-row-1" }],
        [
          { id: "sub-1", providerSubscriptionId: "sub_test_1" },
          { id: "sub-2", providerSubscriptionId: "sub_test_2" },
        ],
      ],
    });
    const { provider } = createFakeProvider();
    let count = 0;
    provider.cancelSubscription = vi.fn(async () => {
      count++;
      if (count === 1) throw new Error("stripe rejected");
      return {
        id: "sub_test_2",
        status: "canceled",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      };
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });
    const result = await cancelBillingForSubject(deps, userSubject);
    expect(result).toEqual({ canceled: 1, failed: 1 });
  });
});
