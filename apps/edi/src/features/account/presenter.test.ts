import { describe, expect, it } from "vitest";
import { suitePricing } from "../billing/pricing";
import { type AccountSnapshot, describeLastSeen, presentAccount } from "./presenter";

const user = { name: "Marina", email: "marina@example.test", emailVerified: true };
const plain = (value: string) => value.replace(/\s/g, " ");
// 17/10/2026 15:00 in São Paulo (UTC-3).
const now = new Date("2026-10-17T18:00:00Z");

function account(overrides: Partial<AccountSnapshot>): AccountSnapshot {
  return {
    user,
    access: { allowed: false, reason: "subscription_required" },
    plans: [],
    devices: [],
    ...overrides,
  };
}

describe("account presentation", () => {
  it("describes the last time a computer was seen in São Paulo time", () => {
    expect(describeLastSeen("2026-10-17T17:32:00Z", now)).toBe("visto hoje às 14:32");
    expect(describeLastSeen("2026-10-16T12:10:00Z", now)).toBe("visto ontem às 09:10");
    expect(describeLastSeen("2026-10-12T12:00:00Z", now)).toBe("visto em 12/10/2026");
    // 02:30 UTC on the 17th is still the 16th in São Paulo.
    expect(describeLastSeen("2026-10-17T02:30:00Z", now)).toBe("visto ontem às 23:30");
  });

  it("shows the plan and renewal of an active subscription", () => {
    const view = presentAccount(
      account({
        access: { allowed: true, paidThrough: "2026-11-17T18:00:00Z" },
        plans: [
          {
            status: "active",
            productId: "edi_suite_monthly",
            periodEnd: "2026-11-17T18:00:00Z",
            cancelAtPeriodEnd: false,
          },
        ],
      }),
      now,
      suitePricing(),
    );
    expect(view.subscription.kind).toBe("active");
    if (view.subscription.kind !== "active") return;
    expect(plain(view.subscription.planLabel ?? "")).toBe("Mensal · R$ 49,90");
    expect(view.subscription.dateLabel).toBe("Renova em");
    expect(view.subscription.date).toBe("17 de novembro de 2026");
    expect(view.subscription.monthly).toBe(true);
  });

  it("uses the paid period when the subscription is set to end", () => {
    const view = presentAccount(
      account({
        access: { allowed: true, paidThrough: "2027-10-17T18:00:00Z" },
        plans: [
          {
            status: "active",
            productId: "edi_suite_annual",
            periodEnd: "2027-10-17T18:00:00Z",
            cancelAtPeriodEnd: true,
          },
        ],
      }),
      now,
      suitePricing(),
    );
    if (view.subscription.kind !== "active") throw new Error("expected active");
    expect(plain(view.subscription.planLabel ?? "")).toBe("Anual · R$ 499");
    expect(view.subscription.ending).toBe(true);
    expect(view.subscription.dateLabel).toBe("Acesso até");
  });

  it("separates first visits from returning customers and payment problems", () => {
    expect(presentAccount(account({}), now, suitePricing()).subscription).toEqual({
      kind: "none",
      returning: false,
    });
    const ended = {
      status: "canceled",
      productId: "edi_suite_monthly",
      periodEnd: "2026-09-17T18:00:00Z",
      cancelAtPeriodEnd: false,
    };
    expect(presentAccount(account({ plans: [ended] }), now, suitePricing()).subscription).toEqual({
      kind: "none",
      returning: true,
    });
    // The access projection reports an ended paid period as payment_required.
    // Without an open charge, the customer must see the plans to subscribe again.
    expect(
      presentAccount(
        account({ access: { allowed: false, reason: "payment_required" }, plans: [ended] }),
        now,
        suitePricing(),
      ).subscription,
    ).toEqual({ kind: "none", returning: true });
    expect(
      presentAccount(
        account({
          access: { allowed: false, reason: "payment_required" },
          plans: [{ ...ended, status: "past_due" }],
        }),
        now,
        suitePricing(),
      ).subscription.kind,
    ).toBe("payment_required");
  });

  it("does not promise a renewal for a subscription already canceled with paid time left", () => {
    const view = presentAccount(
      account({
        access: { allowed: true, paidThrough: "2026-11-01T18:00:00Z" },
        plans: [
          {
            status: "canceled",
            productId: "edi_suite_monthly",
            periodEnd: "2026-11-17T18:00:00Z",
            cancelAtPeriodEnd: false,
          },
        ],
      }),
      now,
      suitePricing(),
    );
    if (view.subscription.kind !== "active") throw new Error("expected active");
    expect(view.subscription.ending).toBe(true);
    expect(view.subscription.dateLabel).toBe("Acesso até");
    expect(view.subscription.date).toBe("1 de novembro de 2026");
  });
});
