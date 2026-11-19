import type { StripeMode } from "@informach/config";

export const MODOS_DA_COBRANCA = ["off", "setup", "sandbox", "live"] as const;
export type ModoDaCobranca = (typeof MODOS_DA_COBRANCA)[number];

/** Disponibilidade de envio não substitui catálogo, autoridade ou consentimento. */
export function envioComercialDisponivel(modo: ModoDaCobranca) {
  return modo === "sandbox" || modo === "live";
}

/** Prefixo é só a primeira barreira: o reader também confere livemode de cada
 * objeto e o catálogo/portal antes de qualquer criação de Checkout. */
export function segredoStripeCompativel(modo: StripeMode, segredo: unknown): segredo is string {
  return (
    typeof segredo === "string" &&
    (modo === "dev"
      ? /^(sk|rk)_test_[A-Za-z0-9_]{8,}$/.test(segredo)
      : /^(sk|rk)_live_[A-Za-z0-9_]{8,}$/.test(segredo))
  );
}
