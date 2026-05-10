import { describe, expect, it } from "vitest";
import { getProSubscription, hasProSubscription, PRO_STATUSES } from "../access";
import { createFakeDb } from "./_fake-db";

const subject = { type: "user" as const, id: "user-1" };

const sampleRow = {
  subscriptions: {
    id: "sub-row-1",
    customerId: "customer-row-1",
    provider: "stripe",
    providerSubscriptionId: "sub_test_1",
    productId: "cozya_pro_monthly",
    providerPriceId: "price_dev_monthly",
    status: "active",
    currentPeriodStart: new Date("2026-04-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-05-01T00:00:00Z"),
    cancelAtPeriodEnd: null,
    canceledAt: null,
    trialEnd: null,
    nextCreditGrantAt: null,
    pendingProductId: null,
    pendingPriceId: null,
    metadata: {},
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  },
  customers: {
    id: "customer-row-1",
    provider: "stripe",
    providerCustomerId: "cus_test_1",
    subjectType: "user",
    subjectId: "user-1",
    email: "user@cozya.app",
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("PRO_STATUSES", () => {
  it("contains exactly active and trialing", () => {
    expect([...PRO_STATUSES]).toEqual(["active", "trialing"]);
  });
});

describe("getProSubscription", () => {
  it("returns the row when status is active", async () => {
    const { db } = createFakeDb({ selectQueue: [[sampleRow]] });
    const result = await getProSubscription(
      { db: db as never, provider: "stripe", app: "test-app" },
      subject,
    );
    expect(result?.id).toBe("sub-row-1");
    expect(result?.status).toBe("active");
  });

  it("returns the row when status is trialing", async () => {
    const trialingRow = {
      ...sampleRow,
      subscriptions: { ...sampleRow.subscriptions, status: "trialing" },
    };
    const { db } = createFakeDb({ selectQueue: [[trialingRow]] });
    const result = await getProSubscription(
      { db: db as never, provider: "stripe", app: "test-app" },
      subject,
    );
    expect(result?.status).toBe("trialing");
  });

  // The query itself filters by `inArray(status, PRO_STATUSES)`, so when the
  // user only has e.g. a past_due subscription, the SELECT returns no rows —
  // which is what we simulate here.
  it.each([
    "past_due",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "canceled",
    "paused",
  ])("returns null when subject only has %s", async (_status) => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const result = await getProSubscription(
      { db: db as never, provider: "stripe", app: "test-app" },
      subject,
    );
    expect(result).toBeNull();
  });

  it("returns null when subject has no subscription at all", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const result = await getProSubscription(
      { db: db as never, provider: "stripe", app: "test-app" },
      subject,
    );
    expect(result).toBeNull();
  });
});

describe("hasProSubscription", () => {
  it("returns true when active row exists", async () => {
    const { db } = createFakeDb({ selectQueue: [[sampleRow]] });
    expect(
      await hasProSubscription({ db: db as never, provider: "stripe", app: "test-app" }, subject),
    ).toBe(true);
  });

  it("returns false when no row matches", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    expect(
      await hasProSubscription({ db: db as never, provider: "stripe", app: "test-app" }, subject),
    ).toBe(false);
  });
});
