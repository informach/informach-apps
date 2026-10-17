import { PRODUCTS } from "@informach/config";

export type SuitePlan = "mensal" | "anual";

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

function suiteProduct(interval: "month" | "year") {
  const product = PRODUCTS.find(
    (item) => item.app === "edi" && item.kind === "subscription" && item.interval === interval,
  );
  if (!product?.listPrice) throw new Error(`Missing Edi ${interval} list price`);
  return { id: product.id, cents: product.listPrice.amountCents };
}

/** Public prices derived from the central catalogue, so a price change reaches every page. */
export function suitePricing() {
  const monthly = suiteProduct("month");
  const annual = suiteProduct("year");
  const twelveMonths = monthly.cents * 12;
  return {
    monthly: { productId: monthly.id, price: brl(monthly.cents) },
    annual: {
      productId: annual.id,
      price: brl(annual.cents),
      perMonth: brl(Math.round(annual.cents / 12)),
      savings: brl(twelveMonths - annual.cents),
      paidMonths: Math.round(annual.cents / monthly.cents),
      freeMonths: 12 - Math.round(annual.cents / monthly.cents),
    },
  };
}

export function planFromParam(value: string | string[] | undefined): SuitePlan {
  return value === "anual" ? "anual" : "mensal";
}
