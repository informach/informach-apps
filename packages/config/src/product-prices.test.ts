import { expect, it } from "vitest";
import { getConfiguredProducts, getProductPriceVariableNames, PRODUCTS } from "./products";

it.each(["dev", "prod"] as const)(
  "configures the four Recreio prices only in %s without changing the approved offer",
  (mode) => {
    const original = structuredClone(PRODUCTS);
    const variables = {
      RECREIO_INDIVIDUAL_MONTHLY_PRICE: "price_recreio_individual_monthly",
      RECREIO_INDIVIDUAL_ANNUAL_PRICE: "price_recreio_individual_annual",
      RECREIO_FAMILY_MONTHLY_PRICE: "price_recreio_family_monthly",
      RECREIO_FAMILY_ANNUAL_PRICE: "price_recreio_family_annual",
      COMPASSO_MONTHLY_PRICE: "price_unrelated",
      STRIPE_SECRET_KEY: "private_not_a_price",
    };
    const products = getConfiguredProducts("recreio", mode, variables);
    expect(getProductPriceVariableNames(["recreio"])).toEqual([
      "RECREIO_FAMILY_ANNUAL_PRICE",
      "RECREIO_FAMILY_MONTHLY_PRICE",
      "RECREIO_INDIVIDUAL_ANNUAL_PRICE",
      "RECREIO_INDIVIDUAL_MONTHLY_PRICE",
    ]);
    expect(products.map((p) => [p.id, p.listPrice?.amountCents, p.listPrice?.currency])).toEqual([
      ["recreio_individual_monthly", 5990, "BRL"],
      ["recreio_individual_annual", 59900, "BRL"],
      ["recreio_family_monthly", 12790, "BRL"],
      ["recreio_family_annual", 127900, "BRL"],
    ]);
    for (const product of products) {
      const previous = original.find((p) => p.id === product.id);
      expect(product).toEqual({
        ...previous,
        stripePriceId: { ...previous?.stripePriceId, [mode]: `price_${product.id}` },
      });
    }
    expect(JSON.stringify(products)).not.toContain("private_not_a_price");
    expect(JSON.stringify(products)).not.toContain("price_unrelated");
    expect(PRODUCTS).toEqual(original);
  },
);

it("rejects a placeholder Recreio override and preserves both modes when absent", () => {
  const registered = PRODUCTS.filter((p) => p.app === "recreio");
  expect(getConfiguredProducts("recreio", "dev", {})).toEqual(registered);
  expect(() =>
    getConfiguredProducts("recreio", "prod", {
      RECREIO_FAMILY_ANNUAL_PRICE: "price_TODO_recreio_family_annual",
    }),
  ).toThrow("Invalid configured price for recreio_family_annual");
});

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
