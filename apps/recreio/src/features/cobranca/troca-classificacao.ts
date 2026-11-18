import { AppError } from "@/lib/errors";

/** Public offer data only. No catalog loading, validation engine, provider or
 * environment enters the browser. Server writers still resolve approved IDs. */
type Oferta = { productId: string; tier: "individual" | "family"; interval: "month" | "year" };
export function classificarOfertasDaTroca(
  atual: Oferta,
  destino: Oferta,
): { tipo: "upgrade"; vigencia: "immediate" } | { tipo: "downgrade"; vigencia: "period_end" } {
  if (atual.productId === destino.productId)
    throw new AppError("OFERTA", "Escolha uma oferta diferente para conferir a troca.");
  const aumento =
    atual.tier !== destino.tier ? destino.tier === "family" : destino.interval === "year";
  return aumento
    ? { tipo: "upgrade", vigencia: "immediate" }
    : { tipo: "downgrade", vigencia: "period_end" };
}
