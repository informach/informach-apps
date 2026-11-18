import { describe, expect, it } from "vitest";
import { stripeDestination } from "../destinations";

describe("financial destinations", () => {
  it.each(["checkout.stripe.com", "billing.stripe.com"])(
    "accepts provider HTTPS host %s",
    (host) => {
      const url = `https://${host}/session/fixture?return=1#fixture`;
      expect(stripeDestination(url)).toBe(url);
    },
  );
  it.each([
    "http://checkout.stripe.com/session",
    "https://checkout.stripe.com.evil.test/session",
    "https://user:password@checkout.stripe.com/session",
    "https://checkout.stripe.com:444/session",
    "javascript:alert(1)",
    "/conta",
    "private_not_a_url",
  ])("rejects untrusted destination %s", (value) => {
    expect(() => stripeDestination(value)).toThrow("Invalid billing destination");
  });
  it("invalid parsing does not preserve a sensitive input on the public error", () => {
    expect.assertions(2);
    try {
      stripeDestination("private_not_a_url");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(JSON.stringify(error)).not.toContain("private_not_a_url");
    }
  });
});
