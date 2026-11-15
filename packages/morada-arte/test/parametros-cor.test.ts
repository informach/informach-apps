import { describe, expect, it } from "vitest";
import type { Rgb } from "../src/cor/cores";
import {
  amostrarParametrosDaCor,
  parametrosDosVertices,
  texturaComMascaraDaRoupa,
} from "../src/cor/parametros";
import { corNoPonto, type FonteDeCor } from "../src/cor/pintura";
import type { Imagem } from "../src/leitura/imagem";

const imagem: Imagem = {
  arquivo: "fixture-sintetica",
  largura: 2,
  altura: 2,
  dados: Uint8Array.from([
    70, 100, 140, 255, 180, 90, 45, 255, 210, 170, 85, 255, 30, 190, 150, 255,
  ]),
};
const mascara: Imagem = {
  ...imagem,
  dados: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 64, 64, 64, 255]),
};
const cores: Rgb[] = [
  [0, 0, 0],
  [1, 1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.03, 0.7, 0.25],
];

describe("cor parametrizada por origem", () => {
  it("transporta RGB e máscara na mesma grade sem alterar os originais", () => {
    const fonte: FonteDeCor = {
      tipo: "roupa",
      imagem,
      mascara,
      livre: { cor: [1, 0, 0], lum: 0.18 },
    };
    const antes = new Uint8Array(imagem.dados);
    const textura = texturaComMascaraDaRoupa(fonte);
    expect(textura.largura).toBe(imagem.largura);
    expect(textura.altura).toBe(imagem.altura);
    expect(textura.dados).toEqual(
      Uint8Array.from([70, 100, 140, 0, 180, 90, 45, 255, 210, 170, 85, 128, 30, 190, 150, 64]),
    );
    expect(imagem.dados).toEqual(antes);
    expect(() =>
      texturaComMascaraDaRoupa({ ...fonte, mascara: { ...mascara, largura: 1 } }),
    ).toThrow(/grades/);
  });
  it("reproduz o tingimento nas regiões sem máscara, parciais e inteiras", () => {
    for (const cor of cores) {
      const fonte: FonteDeCor = { tipo: "roupa", imagem, mascara, livre: { cor, lum: 0.18 } };
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.25, 0.75],
        [0.6, 0.4],
        [-1, 2],
      ]) {
        if (u === undefined || v === undefined) throw new Error("Amostra sem coordenada");
        const p = amostrarParametrosDaCor(fonte, u, v);
        const esperada = corNoPonto(fonte, u, v);
        for (let c = 0; c < 3; c++) {
          const obtida = (p.original[c] ?? 0) * (1 - p.mascara) + (p.peso[c] ?? 0) * (cor[c] ?? 0);
          expect(obtida).toBeCloseTo(esperada[c] ?? 0, 12);
        }
      }
    }
  });

  it("conserva a luminância mínima já definida para a peça", () => {
    const fonte: FonteDeCor = {
      tipo: "roupa",
      imagem,
      mascara,
      livre: { cor: [0.2, 0.4, 0.9], lum: 0 },
    };
    const p = amostrarParametrosDaCor(fonte, 1, 0);
    const esperado = corNoPonto(fonte, 1, 0);
    for (let c = 0; c < 3; c++)
      expect(
        (p.original[c] ?? 0) * (1 - p.mascara) + (p.peso[c] ?? 0) * ([0.2, 0.4, 0.9][c] ?? 0),
      ).toBeCloseTo(esperado[c] ?? 0, 10);
  });

  it("separa paleta/fator e cor lisa sem alterar a fonte nem inferir canais pelo RGB", () => {
    const fontes: FonteDeCor[] = [
      { tipo: "paleta", imagem, fator: [1.8, 0.3, 0.7] },
      { tipo: "lisa", cor: [0.8, 0.2, 0.1] },
    ];
    for (const fonte of fontes) {
      const antes = JSON.stringify(fonte);
      const p = amostrarParametrosDaCor(fonte, 0.2, 0.8);
      const valor =
        fonte.tipo === "paleta" ? fonte.fator : fonte.tipo === "lisa" ? fonte.cor : [0, 0, 0];
      const esperado = corNoPonto(fonte, 0.2, 0.8);
      for (let c = 0; c < 3; c++)
        expect(
          (p.original[c] ?? 0) * (1 - p.mascara) + (p.peso[c] ?? 0) * (valor[c] ?? 0),
        ).toBeCloseTo(esperado[c] ?? 0, 12);
      expect(JSON.stringify(fonte)).toBe(antes);
    }
  });

  it("gera atributos float32 e conserva a cor própria de cada vértice", () => {
    const fonte: FonteDeCor = { tipo: "lisa", cor: [0.2, 0.6, 0.9] };
    const atributo = parametrosDosVertices(
      fonte,
      null,
      2,
      Float32Array.from([0.1, 0.5, 1, 1, 0.7, 0.3]),
    );
    expect(atributo.mascaras).toEqual(Float32Array.from([1, 1]));
    expect(atributo.originais).toEqual(Float32Array.from([0.1, 0.5, 1, 1, 0.7, 0.3]));
    expect(atributo.pesos).toEqual(atributo.originais);
    expect(() => parametrosDosVertices(fonte, new Float32Array(1), 2)).toThrow(/divergentes/);
  });

  it("recusa máscara/luminância ausente e atributos inválidos", () => {
    expect(() =>
      amostrarParametrosDaCor({ tipo: "roupa", imagem, mascara: null, livre: null }, 0, 0),
    ).toThrow(/máscara/);
    for (const lum of [Number.NaN, -1, Number.POSITIVE_INFINITY])
      expect(() =>
        amostrarParametrosDaCor(
          { tipo: "roupa", imagem, mascara, livre: { cor: [1, 1, 1], lum } },
          0,
          0,
        ),
      ).toThrow(/Luminância/);
    expect(() => parametrosDosVertices({ tipo: "lisa", cor: [1, 1, 1] }, null, -1)).toThrow(
      /divergentes/,
    );
    expect(() =>
      parametrosDosVertices(
        { tipo: "lisa", cor: [1, 1, 1] },
        null,
        1,
        Float32Array.from([1, Number.NaN, 1]),
      ),
    ).toThrow(/vértice/);
  });
});
