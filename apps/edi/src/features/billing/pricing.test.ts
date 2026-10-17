import { describe, expect, it } from "vitest";
import { planFromParam, suitePricing } from "./pricing";

// Intl separates the currency symbol with a no-break space.
const plain = (value: string) => value.replace(/\s/g, " ");

describe("suite pricing", () => {
  it("derives the public offer from the central catalogue", () => {
    const pricing = suitePricing();
    expect(plain(pricing.monthly.price)).toBe("R$ 49,90");
    expect(plain(pricing.annual.price)).toBe("R$ 499");
    expect(plain(pricing.annual.perMonth)).toBe("R$ 41,58");
    expect(plain(pricing.annual.savings)).toBe("R$ 99,80");
    expect(pricing.annual.paidMonths).toBe(10);
    expect(pricing.annual.freeMonths).toBe(2);
  });
  it("only preselects the annual plan when asked", () => {
    expect(planFromParam("anual")).toBe("anual");
    expect(planFromParam(["anual"])).toBe("mensal");
    expect(planFromParam(undefined)).toBe("mensal");
  });
});
