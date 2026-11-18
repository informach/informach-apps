import { PRODUCTS } from "@informach/config";
import { z } from "zod";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { AppError } from "@/lib/errors";
import { VERSAO_DA_COMPRA } from "./constantes";

export const AceiteDaCompraSchema = z.strictObject({
  pedidoId: z.uuid(),
  produtoId: z.string().min(2).max(80),
  valorCentavos: z.int().positive(),
  moeda: z.literal("BRL"),
  intervalo: z.enum(["month", "year"]),
  souAdulto: z.literal(true),
  aceitoCobrancaRecorrente: z.literal(true),
  versaoDaDeclaracao: z.literal(VERSAO_DA_DECLARACAO_ADULTA),
  versaoDasCondicoes: z.literal(VERSAO_DA_COMPRA),
});
export type AceiteDaCompra = z.infer<typeof AceiteDaCompraSchema>;
export type OfertaAceita = {
  productId: string;
  tier: "individual" | "family";
  interval: "month" | "year";
  amountCents: number;
  currency: "BRL";
};

/** Compara a oferta vista pelo adulto com a fonte única aprovada; não aceita preço livre. */
export function conferirOfertaDaCompra(
  entrada: Pick<AceiteDaCompra, "produtoId" | "valorCentavos" | "moeda" | "intervalo">,
): OfertaAceita {
  const produto = PRODUCTS.find(
    (p) => p.app === "recreio" && p.id === entrada.produtoId && p.kind === "subscription",
  );
  if (
    !produto ||
    (produto.tier !== "individual" && produto.tier !== "family") ||
    (produto.interval !== "month" && produto.interval !== "year") ||
    !produto.listPrice ||
    produto.listPrice.amountCents !== entrada.valorCentavos ||
    produto.listPrice.currency !== entrada.moeda ||
    produto.interval !== entrada.intervalo
  ) {
    throw new AppError("OFERTA", "Confira a oferta atual antes de autorizar a compra.");
  }
  return {
    productId: produto.id,
    tier: produto.tier,
    interval: produto.interval,
    amountCents: entrada.valorCentavos,
    currency: entrada.moeda,
  };
}
