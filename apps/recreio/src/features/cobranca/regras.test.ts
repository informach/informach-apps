import { PRODUCTS } from "@informach/config";
import { describe, expect, it } from "vitest";
import { pedidoDaCompra } from "../../../test/compra-apoio";
import { AceiteDaCompraSchema, conferirOfertaDaCompra } from "./regras";

describe("aceite da oferta aprovada", () => {
  it("os quatro valores, intervalos e tiers vêm do catálogo aprovado", () => {
    for (const produto of PRODUCTS.filter((p) => p.app === "recreio")) {
      const pedido = AceiteDaCompraSchema.parse(pedidoDaCompra(produto.id));
      expect(conferirOfertaDaCompra(pedido)).toEqual({
        productId: produto.id,
        tier: produto.tier,
        interval: produto.interval,
        amountCents: produto.listPrice?.amountCents,
        currency: produto.listPrice?.currency,
      });
    }
  });
  it("recusa preço e intervalo adulterados ou produto de outro app", () => {
    const pedido = AceiteDaCompraSchema.parse(pedidoDaCompra());
    for (const entrada of [
      { ...pedido, valorCentavos: 1 },
      { ...pedido, intervalo: "year" },
      { ...pedido, produtoId: "edi_suite_monthly" },
    ])
      expect(() => conferirOfertaDaCompra(AceiteDaCompraSchema.parse(entrada))).toThrow(
        "oferta atual",
      );
  });
  it("declaração, recorrência e versões são explícitas e identidade não vem do formulário", () => {
    const pedido = pedidoDaCompra();
    for (const entrada of [
      { ...pedido, souAdulto: false },
      { ...pedido, aceitoCobrancaRecorrente: false },
      { ...pedido, versaoDasCondicoes: "antiga" },
      { ...pedido, versaoDaDeclaracao: "antiga" },
      { ...pedido, contaId: "outra" },
      { ...pedido, moeda: "USD" },
    ])
      expect(AceiteDaCompraSchema.safeParse(entrada).success).toBe(false);
  });
});
