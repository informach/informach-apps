import { AppError } from "@/lib/errors";
import { ofertasParaOAdulto } from "./regras";

type Oferta = ReturnType<typeof ofertasParaOAdulto>[number];
export type ClassificacaoDaTroca = { atual: Oferta; destino: Oferta } & (
  | { tipo: "upgrade"; vigencia: "immediate" }
  | { tipo: "downgrade"; vigencia: "period_end" }
);

/** Coverage reduction takes precedence over a longer billing commitment.
 * Both offers come from the approved catalog, never from client-supplied tiers.
 * This classification alone neither accepts a quote nor changes a contract.
 */
export function classificarTrocaDePlano(
  deProdutoId: string,
  paraProdutoId: string,
): ClassificacaoDaTroca {
  const ofertas = ofertasParaOAdulto();
  const atual = ofertas.find((o) => o.productId === deProdutoId);
  const destino = ofertas.find((o) => o.productId === paraProdutoId);
  if (!atual || !destino || atual.productId === destino.productId)
    throw new AppError("OFERTA", "Escolha uma oferta diferente para conferir a troca.");
  const aumento =
    atual.tier !== destino.tier ? destino.tier === "family" : destino.interval === "year";
  return aumento
    ? { atual, destino, tipo: "upgrade", vigencia: "immediate" }
    : { atual, destino, tipo: "downgrade", vigencia: "period_end" };
}
