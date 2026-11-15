import { describe, expect, it } from "vitest";
import { montarLojaInicial } from "../conteudo/loja";
import { conferirCatalogoDaLoja, OfertaDeMovelSchema } from "./loja";

const disponiveis = montarLojaInicial().ofertas.map(({ catalogo, versaoDoCatalogo }) => ({
  catalogo,
  versaoDoCatalogo,
}));

describe("catálogo fechado da loja", () => {
  it("admite o conteúdo inicial somente com simulação e arte compatíveis", () => {
    const loja = conferirCatalogoDaLoja(montarLojaInicial(), disponiveis);
    expect(loja.ofertas).toHaveLength(8);
    expect(loja.politicaDePrecos).toBe(1);
    expect(() => conferirCatalogoDaLoja(loja, disponiveis.slice(1))).toThrow(/arte compatível/);
  });
  it("recusa item inexistente, outra versão ou oferta repetida", () => {
    const loja = montarLojaInicial();
    const oferta = loja.ofertas[0];
    if (!oferta) throw new Error("Conteúdo inicial sem ofertas");
    const alterar = (campos: Partial<typeof oferta>) => ({
      ...loja,
      ofertas: [{ ...oferta, ...campos }],
    });
    expect(() =>
      conferirCatalogoDaLoja(alterar({ catalogo: "item_inexistente" }), disponiveis),
    ).toThrow(/simulação/);
    expect(() => conferirCatalogoDaLoja(alterar({ versaoDoCatalogo: 2 }), disponiveis)).toThrow(
      /simulação/,
    );
    expect(() =>
      conferirCatalogoDaLoja({ ...loja, ofertas: [oferta, oferta] }, disponiveis),
    ).toThrow(/repetida/);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "recusa preço sem representação inteira segura: %s",
    (compraCentavos) => {
      const oferta = montarLojaInicial().ofertas[0];
      expect(OfertaDeMovelSchema.safeParse({ ...oferta, compraCentavos }).success).toBe(false);
    },
  );
  it("não admite geração de saldo pela revenda, preço enviado como string ou campos extras", () => {
    const oferta = montarLojaInicial().ofertas[0];
    expect(
      OfertaDeMovelSchema.safeParse({ ...oferta, compraCentavos: 100, revendaCentavos: 101 })
        .success,
    ).toBe(false);
    expect(OfertaDeMovelSchema.safeParse({ ...oferta, compraCentavos: "24000" }).success).toBe(
      false,
    );
    expect(OfertaDeMovelSchema.safeParse({ ...oferta, descontoDoCliente: 99 }).success).toBe(false);
  });
  it("cada mundo recebe cópias sem alterar o conteúdo ou outra loja", () => {
    const a = montarLojaInicial();
    const b = montarLojaInicial();
    const oferta = a.ofertas[0];
    if (!oferta) throw new Error("Conteúdo inicial sem ofertas");
    oferta.compraCentavos = 1;
    expect(b.ofertas[0]?.compraCentavos).toBe(24_000);
    expect(montarLojaInicial().ofertas[0]?.compraCentavos).toBe(24_000);
  });
});
