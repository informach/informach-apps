import { describe, expect, it } from "vitest";
import { listar, obter } from "../dominio/tabela";
import { copiar } from "../nucleo/canonico";
import { BRUNO, criarMundoDaProva, LIA } from "../testes";
import { derivarAlvoDaObra, type RascunhoDaObra } from "./alvo-da-obra";

function cenario() {
  const mundo = criarMundoDaProva({ fundadores: [LIA] });
  const familia = listar(mundo.estado.familias)[0];
  const lote = familia?.loteId ? obter(mundo.estado.lotes, familia.loteId) : null;
  const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares.find((a) => a.n === 0);
  const peca = listar(mundo.estado.objetos).find((o) => o.loteId === lote?.id && o.andar === 0);
  if (!familia || !lote || !piso || !peca) throw new Error("Casa ausente");
  const compra: RascunhoDaObra = {
    familiaId: familia.id,
    loteId: lote.id,
    operacao: {
      t: "comprar",
      catalogo: "mesa_lateral_redonda_prateleira_verde",
      versaoDoCatalogo: 1,
      politicaDePrecos: 1,
      revisaoDoEspaco: lote.revisaoDoEspaco,
      colocacao: { pos: [3500, 5000, piso.z], andar: 0, giro: 0 },
      pintura: null,
    },
  };
  return { mundo, familia, lote, piso, peca, compra };
}

describe("alvo de obra derivado no servidor", () => {
  it("compra usa pegada do catálogo sem alocar ID, dinheiro, revisão ou fato", () => {
    const c = cenario();
    const antes = c.mundo.hash();
    const resultado = derivarAlvoDaObra(c.mundo.estado, LIA, c.compra);
    expect(resultado).toMatchObject({ ok: true, alvo: { peca: null, regioes: [{ andar: 0 }] } });
    if (!resultado.ok) throw new Error("Alvo ausente");
    const [x0, y0, x1, y1] = resultado.alvo.regioes[0]?.retangulo ?? [];
    expect(x0).toBeLessThan(3500);
    expect(x1).toBeGreaterThan(3500);
    expect(y0).toBeLessThan(5000);
    expect(y1).toBeGreaterThan(5000);
    expect(c.mundo.hash()).toBe(antes);
  });

  it("mover cobre origem e destino; pintar e vender cobrem a peça atual", () => {
    const c = cenario();
    const mover: RascunhoDaObra = {
      ...c.compra,
      operacao: {
        t: "mover",
        objetoId: c.peca.id,
        revisaoDoObjeto: c.peca.revisao,
        revisaoDoEspaco: c.lote.revisaoDoEspaco,
        colocacao: { pos: [6000, 5000, c.piso.z], andar: 0, giro: 90 },
      },
    };
    const movimento = derivarAlvoDaObra(c.mundo.estado, LIA, mover);
    expect(movimento).toMatchObject({
      ok: true,
      alvo: { peca: { id: c.peca.id, revisao: c.peca.revisao } },
    });
    if (!movimento.ok) throw new Error("Alvo ausente");
    expect(movimento.alvo.regioes).toHaveLength(2);
    const pintura: RascunhoDaObra = {
      ...c.compra,
      operacao: {
        t: "pintar",
        objetoId: c.peca.id,
        revisaoDoObjeto: c.peca.revisao,
        pintura: null,
      },
    };
    const pinturaAlvo = derivarAlvoDaObra(c.mundo.estado, LIA, pintura);
    if (!pinturaAlvo.ok) throw new Error("Alvo da pintura ausente");
    expect(pinturaAlvo.alvo.regioes).toHaveLength(1);
    const venda: RascunhoDaObra = {
      ...c.compra,
      operacao: {
        t: "vender",
        objetoId: c.peca.id,
        revisaoDoObjeto: c.peca.revisao,
        revisaoDoEspaco: c.lote.revisaoDoEspaco,
        politicaDePrecos: 1,
      },
    };
    expect(derivarAlvoDaObra(c.mundo.estado, LIA, venda)).toEqual(pinturaAlvo);
  });

  it("autor sem decorar, revisões antigas e geometria inválida não obtêm alvo", () => {
    const c = cenario();
    expect(derivarAlvoDaObra(c.mundo.estado, BRUNO, c.compra)).toMatchObject({
      ok: false,
      motivo: "sem_permissao",
    });
    if (c.compra.operacao.t !== "comprar") throw new Error("Compra ausente");
    const invalidas: RascunhoDaObra["operacao"][] = [
      { ...c.compra.operacao, revisaoDoEspaco: c.lote.revisaoDoEspaco + 1 },
      {
        ...c.compra.operacao,
        colocacao: {
          ...c.compra.operacao.colocacao,
          pos: [0, 0, c.piso.z],
        },
      },
      {
        ...c.compra.operacao,
        colocacao: {
          ...c.compra.operacao.colocacao,
          pos: [3500, 5000, 0],
        },
      },
    ];
    for (const operacao of invalidas)
      expect(derivarAlvoDaObra(c.mundo.estado, LIA, { ...c.compra, operacao }).ok).toBe(false);
    const pintar: RascunhoDaObra = {
      ...c.compra,
      operacao: {
        t: "pintar",
        objetoId: c.peca.id,
        revisaoDoObjeto: c.peca.revisao + 1,
        pintura: null,
      },
    };
    expect(derivarAlvoDaObra(c.mundo.estado, LIA, pintar)).toMatchObject({
      ok: false,
      motivo: "versao_antiga",
    });
  });

  it("escolher a área exige decorar e continua separado da permissão para gastar", () => {
    const c = cenario();
    c.mundo.aplicar({
      t: "conceder_acesso",
      familiaId: c.familia.id,
      perfilId: BRUNO,
      permissoes: ["decorar"],
    });
    const antes = copiar(c.mundo.estado.familias);
    expect(derivarAlvoDaObra(c.mundo.estado, BRUNO, c.compra).ok).toBe(true);
    expect(c.mundo.estado.familias).toEqual(antes);
  });
});
