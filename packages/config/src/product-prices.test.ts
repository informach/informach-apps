import { expect, it } from "vitest";
import { getConfiguredProducts, getProductPriceVariableNames, PRODUCTS } from "./products";

it("resolves the same deployment price for the legacy app and migration without changing commercial policy", () => {
  const original = structuredClone(PRODUCTS);
  const variables = {
    MISSAO_FAMILY_MONTHLY_PRICE: "price_current_deployment",
    COMPASSO_MONTHLY_PRICE: "price_other_app",
    STRIPE_SECRET_KEY: "private_not_a_price",
  };
  const products = getConfiguredProducts("missao-saber", "prod", variables);
  const product = products.find((row) => row.id === "missao_family_monthly");
  const previous = original.find((row) => row.id === "missao_family_monthly");
  expect(product).toEqual({
    ...previous,
    stripePriceId: { ...previous?.stripePriceId, prod: "price_current_deployment" },
  });
  expect(JSON.stringify(products)).not.toContain("private_not_a_price");
  expect(products.every((row) => row.app === "missao-saber")).toBe(true);
  expect(PRODUCTS).toEqual(original);
});

it("keeps registered prices when no override is configured and rejects invalid configured IDs", () => {
  const before = PRODUCTS.filter((row) => row.app === "bora-treinar");
  expect(getConfiguredProducts("bora-treinar", "dev", { BORA_FAMILY_MONTHLY_PRICE: "" })).toEqual(
    before,
  );
  for (const value of ["price_TODO", "https://example.test/price", 123, null]) {
    expect(() =>
      getConfiguredProducts("bora-treinar", "dev", { BORA_FAMILY_MONTHLY_PRICE: value }),
    ).toThrow("Invalid configured price");
  }
  expect(getProductPriceVariableNames(["missao-saber"]).sort()).toEqual([
    "MISSAO_FAMILY_ANNUAL_PRICE",
    "MISSAO_FAMILY_MONTHLY_PRICE",
    "MISSAO_INDIVIDUAL_ANNUAL_PRICE",
    "MISSAO_INDIVIDUAL_MONTHLY_PRICE",
  ]);
});
