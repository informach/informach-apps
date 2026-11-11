import { describe, expect, it } from "vitest";
import { billingAvailability } from "./availability";

describe("billing admission during an operational sales pause", () => {
  it("keeps cancellations, reconciliation and receipts accessible while preventing new commitments", () => {
    expect(
      billingAvailability(
        {
          COMPASSO_BILLING_ENABLED: false,
          STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
          STRIPE_PORTAL_CONFIGURATION_ID: "bpc_synthetic_fixture",
        },
        true,
      ),
    ).toEqual({
      subscribe: false,
      "buy-credits": false,
      "resume-purchase": false,
      "restore-renewal": false,
      "change-plan": false,
      "cancel-purchase": true,
      "cancel-subscription": true,
      "cancel-plan-change": true,
      refresh: true,
      portal: true,
    });
  });
  it("does not advertise provider operations before configuration exists", () => {
    const unavailable = billingAvailability(
      {
        COMPASSO_BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: "",
        STRIPE_PORTAL_CONFIGURATION_ID: "",
      },
      true,
    );
    expect(Object.values(unavailable).some(Boolean)).toBe(false);
    const maintenance = billingAvailability(
      {
        COMPASSO_BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
        STRIPE_PORTAL_CONFIGURATION_ID: "",
      },
      true,
    );
    expect(maintenance.portal).toBe(false);
    expect(maintenance.refresh).toBe(true);
  });
  it("keeps only receipts and reconciliation during or after an account closure", () => {
    const operations = billingAvailability(
      {
        COMPASSO_BILLING_ENABLED: true,
        STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
        STRIPE_PORTAL_CONFIGURATION_ID: "bpc_synthetic_fixture",
      },
      false,
    );
    expect(
      Object.entries(operations)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ).toEqual(["refresh", "portal"]);
  });
});
