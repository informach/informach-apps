import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import { VERSAO_DA_COMPRA } from "@/features/cobranca/constantes";
import type { AceiteDaCompra } from "@/features/cobranca/regras";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";

export function pedidoDaCompra(
  produtoId = "recreio_individual_monthly",
  perfis: AceiteDaCompra["perfis"] = [],
) {
  const produto = PRODUCTS.find((p) => p.app === "recreio" && p.id === produtoId);
  if (!produto?.listPrice || !produto.interval) throw new Error("Oferta de fixture ausente");
  return {
    pedidoId: randomUUID(),
    produtoId: produto.id,
    valorCentavos: produto.listPrice.amountCents,
    moeda: produto.listPrice.currency,
    intervalo: produto.interval,
    souAdulto: true,
    aceitoCobrancaRecorrente: true,
    versaoDasCondicoes: VERSAO_DA_COMPRA,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    perfis,
  };
}
