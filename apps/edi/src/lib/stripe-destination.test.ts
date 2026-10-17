import { describe, expect, it } from "vitest";
import { stripeDestination } from "./stripe-destination";

describe("billing navigation", () => {
  it("accepts provider checkout and portal destinations", () => {
    expect(stripeDestination("https://checkout.stripe.com/c/pay/example")).toBe(
      "https://checkout.stripe.com/c/pay/example",
    );
    expect(stripeDestination("https://billing.stripe.com/p/session/example")).toContain(
      "billing.stripe.com",
    );
  });
  it.each([
    "http://checkout.stripe.com/",
    "https://checkout.stripe.com.evil.test/",
    "https://evil@billing.stripe.com/",
    "https://billing.stripe.com:444/",
    "/conta",
  ])("rejects unsafe destination %s", (value) => {
    expect(() => stripeDestination(value)).toThrow();
  });
});
