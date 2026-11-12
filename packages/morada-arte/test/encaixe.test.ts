import { describe, expect, it } from "vitest";
import {
  comCorLivre,
  hexParaLinear,
  inteiroParaHex,
  linearParaSrgb,
  srgbParaLinear,
  tomDePele,
} from "../src/cor/cores";
import {
  assarTextura,
  coresDosVertices,
  erroDaPinturaPorVertice,
  type FonteDeCor,
} from "../src/cor/pintura";
import {
  camadaCoberta,
  coberturaDaPele,
  pecasAcima,
  REFERENCIAL_DO_MODELO,
  raioNoTriangulo,
  semTriangulosCobertos,
} from "../src/encaixe/cobertura";
import { normaisDosVertices } from "../src/encaixe/montar";
import { normaisDaPele, posicoesDaPeca } from "../src/encaixe/posicoes";
import type { Corpo, Primitiva } from "../src/leitura/corpo";
import type { Imagem } from "../src/leitura/imagem";
import type { Familia } from "../src/leitura/tabelas";
import { cortarPorPlano, emendar, type Parte, recortar } from "../src/personagem/partes";

/** Uma pele plana em z = 0: um quadrado de lado 1 em dois triângulos, virado para +Z. */
const PELE = Float64Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
const familia = (escala = 1): Familia => ({
  nome: "m",
  tris: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  areas: Float64Array.from([0.5 * escala, 0.5 * escala]),
  nv: 4,
  cabeca: [
    [0, 0, 0],
    [1, 1, 1],
  ],
});

describe("posições de uma peça sobre a pele", () => {
  it("as normais da pele plana apontam para fora", () => {
    expect(Array.from(normaisDaPele(PELE, familia().tris, 4))).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
  });

  it("o ponto fica no lugar das baricêntricas, afastado pela normal", () => {
    const pos = posicoesDaPeca(PELE, familia(), {
      tri: Uint16Array.from([0, 0]),
      // o primeiro ponto no vértice 0; o segundo no meio da aresta 0→1
      bar: Uint16Array.from([65535, 0, 32768, 32767]),
      off: Int16Array.from([0, 0, 200, 0, 0, 400]),
      indices: null,
    });
    expect(pos[0]).toBeCloseTo(0, 6);
    expect(pos[1]).toBeCloseTo(0, 6);
    expect(pos[2]).toBeCloseTo(0.01, 6);
    expect(pos[3]).toBeCloseTo(0.5, 4);
    expect(pos[5]).toBeCloseTo(0.02, 6);
  });

  it("o deslocamento acompanha o tamanho do triângulo no corpo", () => {
    // a malha-base tinha um quarto da área: o corpo é o dobro do tamanho, e o afastamento dobra
    const pos = posicoesDaPeca(PELE, familia(0.25), {
      tri: Uint16Array.from([0]),
      bar: Uint16Array.from([21845, 21845]),
      off: Int16Array.from([100, 0, 200]),
      indices: null,
    });
    expect(pos[2]).toBeCloseTo(0.02, 6);
    // e1 é a aresta 0→1 (eixo x): 100 passos de 0,05 mm, vezes 2
    expect(pos[0]).toBeCloseTo(2 / 3 + 0.01, 4);
  });

  it("a folga empurra o ponto que ficaria rente a um vértice da pele que sobe", () => {
    const comCalombo = Float64Array.from(PELE);
    comCalombo[8] = 0.05; // o vértice 2 sobe 5 cm
    const liga = {
      tri: Uint16Array.from([0]),
      bar: Uint16Array.from([0, 0]),
      off: Int16Array.from([0, 0, 20]),
      indices: null,
    };
    const rente = posicoesDaPeca(PELE, familia(), liga);
    const empurrado = posicoesDaPeca(comCalombo, familia(), liga);
    const distancia = (p: Float32Array) =>
      Math.hypot((p[0] ?? 0) - 1, (p[1] ?? 0) - 1, (p[2] ?? 0) - (p === rente ? 0 : 0.05));
    expect(distancia(rente)).toBeCloseTo(0.001, 5);
    expect(distancia(empurrado)).toBeGreaterThan(0.001);
  });

  it("as normais dos vértices são as do three: soma das faces, normalizada", () => {
    const normais = normaisDosVertices(Float32Array.from(PELE), [0, 1, 2, 0, 2, 3]);
    expect(Array.from(normais)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });
});

const corpoDeTeste: Corpo = {
  id: "boneco",
  arquivo: "boneco.glb",
  armadura: { nome: "boneco", translacao: [0, 0, 0], rotacao: [0, 0, 0, 1], escala: [1, 1, 1] },
  ossos: [
    { nome: "Hips", pai: -1, translacao: [0, 0, 0], rotacao: [0, 0, 0, 1], escala: [1, 1, 1] },
    { nome: "LeftArm", pai: 0, translacao: [0, 0, 0], rotacao: [0, 0, 0, 1], escala: [1, 1, 1] },
  ],
  inversas: new Float32Array(32),
  malhas: [],
  altura: 1.7,
  chao: 0,
};

const pelePrimitiva = (osso: number): Primitiva => ({
  material: "Pele",
  posicoes: Float32Array.from(PELE),
  normais: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uv: null,
  cores: null,
  ossos: Uint16Array.from({ length: 16 }, (_, k) => (k % 4 === 0 ? osso : 0)),
  pesos: Float32Array.from({ length: 16 }, (_, k) => (k % 4 === 0 ? 1 : 0)),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  formas: [],
});

/** Um pano paralelo à pele, a `z` de altura, um pouco maior que ela. */
const pano = (z: number, de = -0.5, ate = 1.5) => ({
  posicoes: Float32Array.from([de, de, z, ate, de, z, ate, ate, z, de, ate, z]),
  indices: [0, 1, 2, 0, 2, 3],
});

describe("o que some debaixo da roupa", () => {
  it("o raio acerta o triângulo de frente e de costas, e erra fora dele", () => {
    const tris = [0, 0, 1, 1, 0, 1, 0, 1, 1];
    expect(raioNoTriangulo([0.2, 0.2, 0], [0, 0, 1], tris, 0)).toEqual([0.2, 0.2, 1]);
    expect(raioNoTriangulo([0.2, 0.2, 2], [0, 0, -1], tris, 0)).toEqual([0.2, 0.2, 1]);
    expect(raioNoTriangulo([0.9, 0.9, 0], [0, 0, 1], tris, 0)).toBeNull();
    expect(raioNoTriangulo([0.2, 0.2, 2], [0, 0, 1], tris, 0)).toBeNull();
  });

  it("a pele some a até 5 cm da peça e aparece além disso", () => {
    const perto = coberturaDaPele(
      corpoDeTeste,
      pelePrimitiva(1),
      { ...pano(0.03), solta: false, saiaFechada: false },
      REFERENCIAL_DO_MODELO,
    );
    const longe = coberturaDaPele(
      corpoDeTeste,
      pelePrimitiva(1),
      { ...pano(0.08), solta: false, saiaFechada: false },
      REFERENCIAL_DO_MODELO,
    );
    expect(Array.from(perto)).toEqual([1, 1, 1, 1]);
    expect(Array.from(longe)).toEqual([0, 0, 0, 0]);
    expect(Array.from(semTriangulosCobertos([0, 1, 2, 0, 2, 3], perto))).toEqual([]);
    expect(
      Array.from(semTriangulosCobertos([0, 1, 2, 0, 2, 3], Uint8Array.from([1, 1, 1, 0]))),
    ).toEqual([0, 2, 3]);
  });

  it("com saia, a pele das pernas some de mais longe; a dos braços, não", () => {
    const saia = { ...pano(0.12), solta: true, saiaFechada: false };
    expect(
      Array.from(coberturaDaPele(corpoDeTeste, pelePrimitiva(0), saia, REFERENCIAL_DO_MODELO)),
    ).toEqual([1, 1, 1, 1]);
    expect(
      Array.from(coberturaDaPele(corpoDeTeste, pelePrimitiva(1), saia, REFERENCIAL_DO_MODELO)),
    ).toEqual([0, 0, 0, 0]);
  });

  it("na saia fechada, some toda pele de perna entre a barra e o cós", () => {
    // um pano de lado, longe da pele: só a faixa de altura conta
    const saia = {
      posicoes: Float32Array.from([5, 0.3, 5, 6, 0.3, 5, 6, 0.9, 5]),
      indices: [0, 1, 2],
      solta: true,
      saiaFechada: true,
    };
    expect(
      Array.from(coberturaDaPele(corpoDeTeste, pelePrimitiva(0), saia, REFERENCIAL_DO_MODELO)),
    ).toEqual([0, 0, 0, 0]);
    const alta = pelePrimitiva(0);
    alta.posicoes = Float32Array.from([0, 0.5, 0, 1, 0.5, 0, 1, 0.8, 0, 0, 1.2, 0]);
    expect(Array.from(coberturaDaPele(corpoDeTeste, alta, saia, REFERENCIAL_DO_MODELO))).toEqual([
      1, 1, 1, 0,
    ]);
  });

  it("a peça de baixo some onde a de cima a cobre, por fora (4 cm) ou por dentro (1 cm)", () => {
    // a peça de baixo a 2 cm de altura, longe da borda de uma célula da grade dos raios
    const baixo = {
      posicoes: Float32Array.from(PELE, (v, i) => (i % 3 === 2 ? 0.02 : v)),
      indices: [0, 1, 2, 0, 2, 3],
    };
    expect(Array.from(camadaCoberta(1.7, baixo, [pano(0.045)], REFERENCIAL_DO_MODELO))).toEqual([
      1, 1, 1, 1,
    ]);
    expect(Array.from(camadaCoberta(1.7, baixo, [pano(0.075)], REFERENCIAL_DO_MODELO))).toEqual([
      0, 0, 0, 0,
    ]);
    expect(Array.from(camadaCoberta(1.7, baixo, [pano(0.015)], REFERENCIAL_DO_MODELO))).toEqual([
      1, 1, 1, 1,
    ]);
    expect(Array.from(camadaCoberta(1.7, baixo, [pano(0.005)], REFERENCIAL_DO_MODELO))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("as camadas: baixo e meias sob cima e inteira, que ficam sob a de por cima", () => {
    const pecas = [
      { id: "calca", slot: "baixo", cobre: false },
      { id: "blusa", slot: "cima", cobre: false },
      { id: "casaco", slot: "sobre", cobre: false },
      { id: "tenis", slot: "pes", cobre: false },
    ];
    const acima = (id: string, entre = pecas) =>
      pecasAcima(entre.find((p) => p.id === id) ?? { id, slot: "", cobre: false }, entre);
    expect(acima("calca")).toEqual(["blusa", "casaco"]);
    expect(acima("blusa")).toEqual(["casaco"]);
    expect(acima("casaco")).toEqual([]);
    expect(acima("tenis")).toEqual([]);
    // a jardineira (inteira que só cobre a parte de baixo) não esconde a calça
    expect(
      acima("calca", [
        { id: "calca", slot: "baixo", cobre: false },
        { id: "jardineira", slot: "inteira", cobre: true },
      ]),
    ).toEqual([]);
  });
});

describe("cores", () => {
  it("vai e volta entre sRGB e linear", () => {
    for (const c of [0, 0.02, 0.2, 0.5, 0.9, 1])
      expect(linearParaSrgb(srgbParaLinear(c))).toBeCloseTo(c, 3);
    expect(hexParaLinear("#FFFFFF")).toEqual([1, 1, 1]);
    expect(inteiroParaHex(13008984)).toBe("#C68058");
  });

  it("o tom de pele é o tom dividido pela cor de referência da paleta", () => {
    const tabelas = { TONS: { Clara: "#FFB69F" }, REF: "#FB9D72", ROSTO: { Clara: 1 } } as never;
    const tom = tomDePele(tabelas, "#FB9D72");
    expect(tom?.pele[0]).toBeCloseTo(1, 6);
    expect(tom?.pele[1]).toBeCloseTo(1, 6);
    expect(tomDePele(tabelas, "Clara")?.rosto).toBe(1);
    expect(tomDePele(tabelas, "#000000")?.rosto).toBeCloseTo(0.28, 6);
    expect(tomDePele(tabelas, "Marciana")).toBeNull();
  });

  it("a cor livre pinta onde a máscara vale e guarda o sombreado", () => {
    const textura: [number, number, number] = [0.2, 0.2, 0.2];
    const livre = { cor: [1, 0, 0] as [number, number, number], lum: 0.4 };
    expect(comCorLivre(textura, 0, livre)).toEqual(textura);
    expect(comCorLivre(textura, 1, livre)[0]).toBeCloseTo(0.5, 6);
    expect(comCorLivre(textura, 1, livre)[1]).toBeCloseTo(0, 6);
    expect(comCorLivre(textura, 1, null)).toEqual(textura);
  });

  const imagem = (lado: number, pixel: (x: number, y: number) => number): Imagem => {
    const dados = new Uint8Array(lado * lado * 4);
    for (let y = 0; y < lado; y++)
      for (let x = 0; x < lado; x++)
        dados.set([pixel(x, y), pixel(x, y), pixel(x, y), 255], (y * lado + x) * 4);
    return { arquivo: "t.png", largura: lado, altura: lado, dados };
  };

  it("uma paleta lisa pinta por vértice sem erro; uma estampa, não", () => {
    const uv = Float32Array.from([0.1, 0.1, 0.9, 0.1, 0.9, 0.9]);
    const lisa: FonteDeCor = {
      tipo: "roupa",
      imagem: imagem(8, () => 128),
      mascara: null,
      livre: null,
    };
    const estampa: FonteDeCor = {
      tipo: "roupa",
      imagem: imagem(8, (x) => (x % 2 ? 255 : 0)),
      mascara: null,
      livre: null,
    };
    expect(erroDaPinturaPorVertice(lisa, uv, [0, 1, 2]).maximo).toBeLessThan(0.01);
    expect(erroDaPinturaPorVertice(estampa, uv, [0, 1, 2]).p99).toBeGreaterThan(30);
    expect(coresDosVertices(lisa, uv, 3)[0]).toBeCloseTo(srgbParaLinear(128 / 255), 6);
  });

  it("a textura assada reduz pela média e aplica a cor livre", () => {
    const fonte: Extract<FonteDeCor, { tipo: "roupa" }> = {
      tipo: "roupa",
      imagem: imagem(4, () => 188),
      mascara: imagem(4, () => 255),
      livre: { cor: [1, 0, 0], lum: srgbParaLinear(188 / 255) },
    };
    const assada = assarTextura(fonte, 2);
    expect([assada.largura, assada.altura]).toEqual([2, 2]);
    expect(Array.from(assada.dados.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });
});

const parteDeTeste = (): Parte => ({
  nome: "quadrado",
  posicoes: Float32Array.from(PELE),
  normais: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uv: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
  coresDoArquivo: null,
  pesos: {
    ossos: new Uint16Array(16),
    pesos: Float32Array.from({ length: 16 }, (_, k) => (k % 4 === 0 ? 1 : 0)),
  },
  pesosDobrado: null,
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  formas: new Map(),
  fonte: { tipo: "lisa", cor: [1, 0, 0] },
});

describe("partes", () => {
  it("o corte por um plano guarda o lado de dentro e fecha a borda no plano", () => {
    const cortada = cortarPorPlano(parteDeTeste(), [0, 0.5, 0], [0, 1, 0]);
    const ys = Array.from(cortada.posicoes).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(0.5, 6);
    let area = 0;
    const p = (v: number, eixo: number): number =>
      cortada.posicoes[(cortada.indices[v] ?? 0) * 3 + eixo] ?? 0;
    for (let t = 0; t < cortada.indices.length; t += 3) {
      area +=
        0.5 *
        ((p(t + 1, 0) - p(t, 0)) * (p(t + 2, 1) - p(t, 1)) -
          (p(t + 2, 0) - p(t, 0)) * (p(t + 1, 1) - p(t, 1)));
    }
    expect(area).toBeCloseTo(0.5, 6);
    expect(cortarPorPlano(parteDeTeste(), [0, -1, 0], [0, 1, 0]).indices.length).toBe(0);
    expect(cortarPorPlano(parteDeTeste(), [0, 2, 0], [0, 1, 0]).indices.length).toBe(6);
  });

  it("recortar tira os vértices que sobram e emendar junta as partes com as formas em zeros", () => {
    const meio = recortar(parteDeTeste(), [0, 2, 3]);
    expect(meio.posicoes.length).toBe(9);
    const comForma = {
      ...parteDeTeste(),
      formas: new Map([
        ["gravidez_1", { posicoes: new Float32Array(12).fill(0.5), normais: null }],
      ]),
    };
    const cores = new Map([
      [meio, new Float32Array(9).fill(1)],
      [comForma, new Float32Array(12).fill(0.25)],
    ]);
    const junta = emendar([meio, comForma], {
      formas: ["gravidez_1"],
      normaisDasFormas: false,
      dobrado: true,
      cores,
      textura: null,
    });
    expect(junta.posicoes.length).toBe(21);
    expect(Array.from(junta.indices.slice(3))).toEqual([3, 4, 5, 3, 5, 6]);
    expect(Array.from(junta.formas[0]?.posicoes ?? []).slice(0, 12)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5,
    ]);
    expect(junta.dobrado?.pesos.length).toBe(28);
    expect(junta.cores?.[0]).toBe(1);
  });
});
