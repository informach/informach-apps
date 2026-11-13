import { PRODUCTS } from "@informach/config";
import { expect, it } from "vitest";
import { compassoProducts, legacyWebProducts } from "./products";

it("applies deployment price IDs without changing approved amounts or another Stripe mode", () => {
  const before = structuredClone(PRODUCTS);
  const products = compassoProducts({
    STRIPE_MODE: "dev",
    COMPASSO_MONTHLY_PRICE: "price_fixture_monthly",
    COMPASSO_ANNUAL_PRICE: "price_fixture_annual",
    COMPASSO_CREDITS_100_PRICE: "price_fixture_100",
    COMPASSO_CREDITS_300_PRICE: "price_fixture_300",
    COMPASSO_CREDITS_1000_PRICE: "price_fixture_1000",
  });
  expect(products.map((p) => p.listPrice?.amountCents)).toEqual([4990, 49900, 1490, 3990, 9990]);
  expect(products.every((p) => p.stripePriceId.dev.startsWith("price_fixture_"))).toBe(true);
  expect(
    products.every(
      (p) => p.stripePriceId.prod === before.find((v) => v.id === p.id)?.stripePriceId.prod,
    ),
  ).toBe(true);
  expect(PRODUCTS).toEqual(before);
});

it("resolves the deployed legacy IDs and excludes independent products from migration", () => {
  const products = legacyWebProducts({
    STRIPE_MODE: "prod",
    legacyPrices: {
      MISSAO_FAMILY_MONTHLY_PRICE: "price_legacy_missao",
      EDI_MONTHLY_PRICE: "price_edi_private",
    },
  });
  expect(
    products.find((product) => product.id === "missao_family_monthly")?.stripePriceId.prod,
  ).toBe("price_legacy_missao");
  expect(
    products.some((product) => ["edi", "compasso", "recreio", "morada"].includes(product.app)),
  ).toBe(false);
});
