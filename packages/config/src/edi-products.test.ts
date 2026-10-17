import { describe, expect, it } from "vitest";
import { EDI_TOOLS } from "./edi-tools";
import { findProductByPriceId, isStripePriceIdConfigured, PRODUCTS } from "./products";

describe("Edi suite commercial catalog", () => {
  it("has one monthly and one annual product at the approved prices", () => {
    const products = PRODUCTS.filter((product) => product.app === "edi");
    expect(products).toHaveLength(2);
    expect(products.map((product) => [product.id, product.interval, product.listPrice])).toEqual([
      ["edi_suite_monthly", "month", { amountCents: 2990, currency: "BRL" }],
      ["edi_suite_annual", "year", { amountCents: 29900, currency: "BRL" }],
    ]);
    expect(products.every((product) => !product.bonusCreditsPerMonth)).toBe(true);
  });
  it("does not accidentally resolve missing/placeholder prices to an Edi product", () => {
    expect(findProductByPriceId("")).toBeUndefined();
    expect(findProductByPriceId("price_TODO_edi")).toBeUndefined();
    expect(isStripePriceIdConfigured("")).toBe(false);
    expect(
      PRODUCTS.filter((product) => product.app === "edi").every(
        (product) => !isStripePriceIdConfigured(product.stripePriceId.prod),
      ),
    ).toBe(true);
  });
  it("registers all five tools with unique Windows identities", () => {
    expect(EDI_TOOLS).toHaveLength(5);
    expect(new Set(EDI_TOOLS.map((tool) => tool.windowsAppId)).size).toBe(5);
  });
});
