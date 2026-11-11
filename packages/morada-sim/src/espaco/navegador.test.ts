import { describe, expect, it } from "vitest";
import type { Lote, Objeto, PontoMm } from "../dominio/tipos";
import type { DocumentoDeImovel } from "../formatos/imovel";
import { distancia } from "../nucleo/fixo";
import { CELULA, criarNavegador } from "./navegador";
import { comprimentoDaRota, duracaoDoMovimento, posicaoNoMovimento } from "./posicoes";

const lote: Lote = {
  id: "lote_000001",
  bairroId: "bairro_000001",
  origem: [0, 0],
  tamanho: [8000, 6000],
  imovelId: "imo_000001",
  familiaId: null,
  entrada: [1125, 5125],
  revisaoDoEspaco: 1,
};

/**
 * Uma casa de dois cômodos: uma parede de x=4000 corta o lote de cima a baixo,
 * com uma porta de 1 m centrada em y=3000.
 */
function casa(comPorta: boolean): DocumentoDeImovel {
  return {
    formato: "morada.imovel",
    versao: 1,
    id: "imo_000001",
    modelo: null,
    revisao: 1,
    fundacao: 0,
    andares: [
      {
        n: 0,
        z: 0,
        contorno: [
          [0, 0],
          [8000, 0],
          [8000, 6000],
          [0, 6000],
        ],
        paredes: [{ id: "p1", a: [4000, 0], b: [4000, 6000] }],
        aberturas: [
          {
            id: "a1",
            parede: "p1",
            centro: [4000, 3000],
            largura: 1000,
            peitoril: 0,
            altura: 2100,
            tipo: comPorta ? "porta" : "janela",
            externa: false,
          },
        ],
        comodos: [],
      },
    ],
  };
}

const A: PontoMm = [1125, 1125];
const B: PontoMm = [6875, 1125];

/** Verdadeiro se algum trecho da rota cruza a parede fora do vão da porta. */
function atravessaParede(rota: PontoMm[]): boolean {
  for (let i = 1; i < rota.length; i++) {
    const a = rota[i - 1] as PontoMm;
    const b = rota[i] as PontoMm;
    if ((a[0] - 4000) * (b[0] - 4000) >= 0) continue;
    const y = a[1] + ((b[1] - a[1]) * (4000 - a[0])) / (b[0] - a[0]);
    if (y < 2500 || y > 3500) return true;
  }
  return false;
}

describe("navegação em grade", () => {
  it("em lote vazio o caminho é direto", () => {
    const nav = criarNavegador(lote, null, []);
    const rota = nav.rota(A, B);
    expect(rota?.[0]).toEqual(A);
    expect(rota?.at(-1)).toEqual(B);
    expect(comprimentoDaRota(rota as PontoMm[])).toBeLessThan(distancia(A, B) + CELULA);
  });

  it("a parede fecha a passagem e a porta abre", () => {
    const fechado = criarNavegador(lote, casa(false), []);
    expect(fechado.rota(A, B)).toBeNull();
    expect(fechado.custosDe(A)(B)).toBeNull();

    const aberto = criarNavegador(lote, casa(true), []);
    const rota = aberto.rota(A, B);
    expect(rota).not.toBeNull();
    expect(atravessaParede(rota as PontoMm[])).toBe(false);
    // O desvio pela porta é mais longo que a linha reta.
    expect(comprimentoDaRota(rota as PontoMm[])).toBeGreaterThan(distancia(A, B));
    expect(aberto.custosDe(A)(B)).toBeGreaterThan(distancia(A, B) - CELULA);
  });

  it("janela não é passagem", () => {
    expect(criarNavegador(lote, casa(false), []).alcancavel(B)).toBe(false);
    expect(criarNavegador(lote, casa(true), []).alcancavel(B)).toBe(true);
  });

  it("móvel que bloqueia é contornado, e ninguém para dentro dele", () => {
    // Uma cama de casal no meio do caminho entre A e a porta.
    const cama: Objeto = {
      id: "obj_000001",
      loteId: lote.id,
      catalogo: "cama_casal_classica_terracota",
      versao: 1,
      pos: [2500, 2000, 0],
      andar: 0,
      giro: 0,
      cor: 0,
      ocupacao: {},
    };
    const nav = criarNavegador(lote, null, [cama]);
    const dentro: PontoMm = [2500, 2000];
    expect(nav.livre(dentro)).toBe(false);
    expect(nav.rota(A, dentro)).toBeNull();
    const perto = nav.livreMaisPerto(dentro);
    expect(perto && nav.livre(perto)).toBe(true);

    const rota = nav.rota([1125, 2125], [4875, 2125]) as PontoMm[];
    expect(rota.length).toBeGreaterThan(2);
    for (const ponto of rota) expect(nav.livre(ponto), ponto.join(",")).toBe(true);

    // Os lugares de onde se chega à cama ficam fora dela e são alcançáveis.
    for (const ponto of ["deitar_1", "deitar_2"]) {
      const acesso = nav.acesso(cama, ponto);
      expect(acesso && nav.alcancavel(acesso.pos), ponto).toBe(true);
    }
  });

  it("a mesma pergunta dá sempre o mesmo caminho", () => {
    const nav = criarNavegador(lote, casa(true), []);
    expect(nav.rota(A, B)).toEqual(nav.rota(A, B));
    expect(criarNavegador(lote, casa(true), []).rota(A, B)).toEqual(nav.rota(A, B));
  });

  it("fora do lote não há caminho", () => {
    const nav = criarNavegador(lote, null, []);
    expect(nav.rota(A, [9000, 1000])).toBeNull();
    expect(nav.livre([-10, 10])).toBe(false);
  });
});

describe("movimento", () => {
  const movimento = {
    rota: [
      [0, 0],
      [1000, 0],
      [1000, 500],
    ] as PontoMm[],
    inicioTick: 100,
    mmPorTick: 130,
    v: 1,
  };

  it("a posição é uma conta sobre a rota e o tick", () => {
    expect(posicaoNoMovimento(movimento, 90)).toEqual([0, 0]);
    expect(posicaoNoMovimento(movimento, 100)).toEqual([0, 0]);
    expect(posicaoNoMovimento(movimento, 101)).toEqual([130, 0]);
    // Depois de 1000 mm vira a esquina.
    expect(posicaoNoMovimento(movimento, 108)).toEqual([1000, 40]);
    expect(posicaoNoMovimento(movimento, 10_000)).toEqual([1000, 500]);
  });

  it("chega no tick previsto", () => {
    expect(comprimentoDaRota(movimento.rota)).toBe(1500);
    const duracao = duracaoDoMovimento(movimento);
    expect(duracao).toBe(12);
    expect(posicaoNoMovimento(movimento, 100 + duracao)).toEqual([1000, 500]);
    expect(posicaoNoMovimento(movimento, 100 + duracao - 1)).not.toEqual([1000, 500]);
  });
});
