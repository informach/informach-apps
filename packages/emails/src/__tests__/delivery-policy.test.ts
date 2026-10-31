import { describe, expect, it } from "vitest";
import { shouldRespectUnsubscribe } from "../delivery-policy";

describe("which categories obey an unsubscribe", () => {
  it("keeps access e-mails and the Bastidores outage alert flowing", () => {
    expect(shouldRespectUnsubscribe("auth.sign-in-otp")).toBe(false);
    expect(shouldRespectUnsubscribe("auth.two-factor-setup-otp")).toBe(false);
    expect(shouldRespectUnsubscribe("admin.alert")).toBe(false);
  });

  it("lets the weekly summary and product e-mails be turned off", () => {
    expect(shouldRespectUnsubscribe("admin.weekly-summary")).toBe(true);
    expect(shouldRespectUnsubscribe("billing.payment-failed")).toBe(true);
    expect(shouldRespectUnsubscribe("missao.weekly-report")).toBe(true);
    expect(shouldRespectUnsubscribe("bora.reminder")).toBe(true);
    expect(shouldRespectUnsubscribe("bora.weekly-summary")).toBe(true);
  });
});
