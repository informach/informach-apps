import { describe, expect, it, vi } from "vitest";
import { sendBillingEmail, type BillingEmailDeps } from "../billing-emails";

const recipient = { email: "user@example.com", userId: "user-1" };

function makeDeps(overrides: Partial<BillingEmailDeps> = {}): BillingEmailDeps {
  return {
    sendEmail: vi.fn(async () => ({ ok: true, status: "sent" }) as never),
    renderTemplate: vi.fn(async () => ({
      html: "<p>hi</p>",
      text: "hi",
      subject: "Subject",
    })),
    appName: "Test App",
    manageBillingUrl: "https://app.example.com/billing",
    buildUnsubscribeUrl: (id, cat) => `https://app.example.com/u?t=${id}_${cat}`,
    unsubscribeMailto: "unsubscribe@app.example.com",
    ...overrides,
  };
}

describe("sendBillingEmail", () => {
  it("sends payment-success when fully configured", async () => {
    const deps = makeDeps();
    const result = await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient,
      messageKey: "evt_1",
      productName: "Pro Mensal",
      amountFormatted: "R$ 49,90",
    });
    expect(result).toEqual({ sent: true, reason: "ok" });
    expect(deps.renderTemplate).toHaveBeenCalledWith(
      "billing.payment-success",
      expect.objectContaining({
        appName: "Test App",
        productName: "Pro Mensal",
        amountFormatted: "R$ 49,90",
        manageBillingUrl: "https://app.example.com/billing",
      }),
    );
    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "billing.payment-success",
        messageKey: "evt_1",
        userId: "user-1",
        to: "user@example.com",
      }),
    );
  });

  it("renders subscription-canceled with reactivateUrl pointing at manageBillingUrl", async () => {
    const deps = makeDeps();
    await sendBillingEmail(deps, {
      category: "billing.subscription-canceled",
      recipient,
      messageKey: "evt_cancel_1",
      productName: "Pro",
      accessUntil: "30/05/2026",
    });
    expect(deps.renderTemplate).toHaveBeenCalledWith(
      "billing.subscription-canceled",
      expect.objectContaining({
        productName: "Pro",
        accessUntil: "30/05/2026",
        reactivateUrl: "https://app.example.com/billing",
      }),
    );
  });

  it("renders credits-purchased with dashboardUrl mapping", async () => {
    const deps = makeDeps();
    await sendBillingEmail(deps, {
      category: "billing.credits-purchased",
      recipient,
      messageKey: "evt_credits_1",
      creditAmount: 5000,
      balanceAfter: 12500,
    });
    expect(deps.renderTemplate).toHaveBeenCalledWith(
      "billing.credits-purchased",
      expect.objectContaining({
        creditAmount: 5000,
        balanceAfter: 12500,
        dashboardUrl: "https://app.example.com/billing",
      }),
    );
  });

  it("returns not_configured when sendEmail is missing", async () => {
    const deps = makeDeps({ sendEmail: undefined });
    const result = await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient,
      messageKey: "evt_1",
      productName: "Pro",
      amountFormatted: "R$ 1,00",
    });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
  });

  it("returns manage_url_missing when manageBillingUrl absent", async () => {
    const deps = makeDeps({ manageBillingUrl: undefined });
    const result = await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient,
      messageKey: "evt_1",
      productName: "Pro",
      amountFormatted: "R$ 1,00",
    });
    expect(result.reason).toBe("manage_url_missing");
  });

  it("returns unsubscribe_url_missing when builder absent", async () => {
    const deps = makeDeps({ buildUnsubscribeUrl: undefined });
    const result = await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient,
      messageKey: "evt_1",
      productName: "Pro",
      amountFormatted: "R$ 1,00",
    });
    expect(result.reason).toBe("unsubscribe_url_missing");
  });

  it("returns send_failed when sendEmail throws (does not propagate)", async () => {
    const deps = makeDeps({
      sendEmail: vi.fn(async () => {
        throw new Error("smtp down");
      }),
    });
    const result = await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient,
      messageKey: "evt_1",
      productName: "Pro",
      amountFormatted: "R$ 1,00",
    });
    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });

  it("returns render_failed when renderTemplate throws (does not propagate)", async () => {
    const deps = makeDeps({
      renderTemplate: vi.fn(async () => {
        throw new Error("template explode");
      }),
    });
    const result = await sendBillingEmail(deps, {
      category: "billing.subscription-renewed",
      recipient,
      messageKey: "evt_1",
      productName: "Pro",
      nextBillingDate: "01/06/2026",
    });
    expect(result).toEqual({ sent: false, reason: "render_failed" });
  });

  it("uses email as default unsubscribe identifier", async () => {
    const builder = vi.fn((id: string) => `https://u?id=${id}`);
    const deps = makeDeps({ buildUnsubscribeUrl: builder });
    await sendBillingEmail(deps, {
      category: "billing.payment-success",
      recipient: { email: "alice@x.com" },
      messageKey: "evt_1",
      productName: "Pro",
      amountFormatted: "R$ 1,00",
    });
    expect(builder).toHaveBeenCalledWith("alice@x.com", "billing.payment-success");
  });
});
