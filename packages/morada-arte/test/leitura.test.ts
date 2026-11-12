import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErroDeArte } from "../src/erros";
import { Biblioteca } from "../src/leitura/biblioteca";
import { decodificarCabelos, decodificarRoupas } from "../src/leitura/catalogos";
import { lerCorpo, normalizarPesos } from "../src/leitura/corpo";
import { amostrar, escreverPng, lerPng } from "../src/leitura/imagem";
import {
  abrirGzBase64,
  blocoDoItem,
  decodificarItem,
  geometriaDaFamilia,
} from "../src/leitura/item";
import { decodificarTabelasDaPagina } from "../src/leitura/pagina";
import { decodificarFamilias, decodificarPeles } from "../src/leitura/tabelas";
import { emGzBase64, fabricarArte, itemMit1 } from "./fabrica";

const erroDe = (fn: () => unknown): ErroDeArte => {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof ErroDeArte) return erro;
    throw erro;
  }
  throw new Error("esperava um ErroDeArte");
};

describe("item no formato MIT1", () => {
  const cabecalho = {
    id: "peca",
    familias: { m: true },
    tipo: "pele",
    uv: true,
    nv: 2,
    ni: 1,
    grupos: [[0, 3, "Roupa_Gen_liso"]],
  };
  const blocos = [
    { nome: "m_tri", tipo: "uint16" as const, valores: [0, 0] },
    { nome: "m_bar", tipo: "uint16" as const, valores: [65535, 0, 0, 65535] },
    { nome: "m_off", tipo: "int16" as const, valores: [0, 0, 100, 0, 0, -100] },
    { nome: "uv", tipo: "uint16" as const, valores: [0, 0, 65535, 65535] },
    { nome: "idx", tipo: "uint16" as const, valores: [0, 1, 0] },
  ];

  it("lê o cabeçalho e os blocos com o tipo de cada um", () => {
    const item = decodificarItem(itemMit1(cabecalho, blocos), "peca.txt");
    expect(item.cabecalho.tipo).toBe("pele");
    expect(Array.from(blocoDoItem(item, "m_off", Int16Array))).toEqual([0, 0, 100, 0, 0, -100]);
    expect(geometriaDaFamilia(item, "m").nv).toBe(2);
  });

  it("abre o envelope gzip + base64 e recusa o que não é", () => {
    const texto = emGzBase64(itemMit1(cabecalho, blocos));
    expect(decodificarItem(abrirGzBase64(texto, "peca.txt"), "peca.txt").cabecalho.id).toBe("peca");
    expect(erroDe(() => abrirGzBase64("isto não é base64!", "peca.txt")).message).toContain(
      "peca.txt",
    );
    expect(
      erroDe(() => abrirGzBase64(Buffer.from("texto puro").toString("base64"), "peca.txt")).message,
    ).toContain("gzip");
  });

  it("diz o arquivo e o campo quando a marca, um bloco ou o cabeçalho estão errados", () => {
    expect(erroDe(() => decodificarItem(Buffer.from("XXXX0000"), "ruim.txt")).message).toContain(
      "MIT1",
    );
    const semBloco = erroDe(() =>
      decodificarItem(itemMit1(cabecalho, blocos.slice(1)), "ruim.txt"),
    );
    expect(semBloco.arquivo).toBe("ruim.txt");
    expect(semBloco.campo).toBe("blocos.m_tri");
    const curto = erroDe(() =>
      decodificarItem(
        itemMit1(cabecalho, [
          { ...blocos[0], nome: "m_tri", tipo: "uint16", valores: [0] },
          ...blocos.slice(1),
        ]),
        "ruim.txt",
      ),
    );
    expect(curto.campo).toBe("blocos.m_tri");
    const tipoErrado = erroDe(() =>
      decodificarItem(itemMit1({ ...cabecalho, tipo: "chapeu" }, blocos), "ruim.txt"),
    );
    expect(tipoErrado.campo).toBe("tipo");
    const indiceFora = erroDe(() =>
      decodificarItem(
        itemMit1(cabecalho, [
          ...blocos.slice(0, 4),
          { nome: "idx", tipo: "uint16", valores: [0, 1, 7] },
        ]),
        "ruim.txt",
      ),
    );
    expect(indiceFora.campo).toBe("blocos.idx");
  });

  it("usa a geometria própria da família quando o item traz uma", () => {
    const item = decodificarItem(
      itemMit1(
        {
          ...cabecalho,
          familias: { m: true, f: true },
          proprios: { f: { nv: 3, ni: 1, grupos: [[0, 3, "Roupa_Gen_liso"]] } },
        },
        [
          ...blocos,
          { nome: "f_tri", tipo: "uint16", valores: [0, 0, 0] },
          { nome: "f_bar", tipo: "uint16", valores: [0, 0, 0, 0, 0, 0] },
          { nome: "f_off", tipo: "int16", valores: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { nome: "f_uv", tipo: "uint16", valores: [0, 0, 0, 0, 0, 0] },
          { nome: "f_idx", tipo: "uint16", valores: [0, 1, 2] },
        ],
      ),
      "peca.txt",
    );
    expect(geometriaDaFamilia(item, "f").nv).toBe(3);
    expect(Array.from(geometriaDaFamilia(item, "f").indices)).toEqual([0, 1, 2]);
    expect(geometriaDaFamilia(item, "m").nv).toBe(2);
  });
});

describe("tabelas das famílias e das peles", () => {
  it("lê as famílias e confere triângulos e áreas", () => {
    const familias = decodificarFamilias(
      {
        m: {
          tris: [0, 1, 2],
          areas: [0.5],
          nv: 3,
          cabeca: [
            [0, 0, 0],
            [1, 1, 1],
          ],
        },
      },
      "familias.txt",
    );
    expect(familias.get("m")?.tris).toBeInstanceOf(Uint32Array);
    expect(
      erroDe(() =>
        decodificarFamilias(
          {
            m: {
              tris: [0, 1, 9],
              areas: [0.5],
              nv: 3,
              cabeca: [
                [0, 0, 0],
                [1, 1, 1],
              ],
            },
          },
          "familias.txt",
        ),
      ).campo,
    ).toBe("m.tris");
    expect(
      erroDe(() =>
        decodificarFamilias(
          {
            m: {
              tris: [0, 1, 2],
              areas: [],
              nv: 3,
              cabeca: [
                [0, 0, 0],
                [1, 1, 1],
              ],
            },
          },
          "familias.txt",
        ),
      ).campo,
    ).toBe("m.areas");
  });

  it("recusa uma pele sem a matriz inteira", () => {
    const erro = erroDe(() =>
      decodificarPeles(
        {
          boneco: {
            familia: "m",
            b2g: [0],
            afim: [[1, 0, 0, 0]],
            cabeca: [
              [0, 0, 0],
              [1, 1, 1],
            ],
          },
        },
        "peles.txt",
      ),
    );
    expect(erro.arquivo).toBe("peles.txt");
    expect(erro.campo).toContain("boneco.afim");
  });
});

describe("catálogos", () => {
  it("a variação herda da base o que não diz", () => {
    const roupas = decodificarRoupas(
      {
        slots: { cima: "Parte de cima" },
        itens: [
          {
            id: "camisa",
            slot: "cima",
            rotulo: "Camisa",
            tipo: "pele",
            variacao: { cor: "#3D7BD6" },
          },
          { id: "regata", base: "camisa", rotulo: "Regata" },
        ],
      },
      "roupas.json",
    );
    expect(roupas.itens.get("regata")).toMatchObject({
      slot: "cima",
      tipo: "pele",
      rotulo: "Regata",
      variacao: { cor: "#3D7BD6" },
    });
  });

  it("recusa base que não existe e slot fora da lista", () => {
    expect(
      erroDe(() =>
        decodificarRoupas(
          { slots: {}, itens: [{ id: "a", base: "b", rotulo: "A" }] },
          "roupas.json",
        ),
      ).message,
    ).toContain("b");
    expect(
      erroDe(() =>
        decodificarRoupas(
          { slots: {}, itens: [{ id: "a", slot: "cima", tipo: "pele", rotulo: "A" }] },
          "roupas.json",
        ),
      ).message,
    ).toContain("cima");
    expect(
      erroDe(() =>
        decodificarCabelos(
          { grupos: {}, originais: {}, itens: [{ id: "a", rotulo: "A" }] },
          "cabelos.json",
        ),
      ).message,
    ).toContain("tipo");
  });
});

describe("tabelas da página de referência", () => {
  const fonte = `const CORPOS = [
  { id: "adulto", rotulo: "Adulto", sexo: "m", idade: "adulto" }, // comentário
];
const EXPR = { neutro: "Neutro" };
const CABELO_CORES = { "Castanho claro": "#976858" };
const COR_PADRAO = { adulto: "Castanho claro",
  adulta: "Ruivo" };
const MANTA_CORES = { "Creme": "#f6efe2" };
const GEMEO = { adulta: "adulto" };
const COM_GRAVIDA = new Set(["adulta"]);
const TONS = { "Clara": "#FFB69F" };
const REF = "#FB9D72"; // cor média da faixa de pele
const ROSTO = { "Clara": 1, "Morena": 0.6 }; // traços`;

  it("lê as declarações literais", () => {
    const tabelas = decodificarTabelasDaPagina(fonte, "corpos.html");
    expect(tabelas.CORPOS[0]).toEqual({
      id: "adulto",
      rotulo: "Adulto",
      sexo: "m",
      idade: "adulto",
    });
    expect(tabelas.COR_PADRAO.adulta).toBe("Ruivo");
    expect(tabelas.COM_GRAVIDA).toEqual(["adulta"]);
    expect(tabelas.REF).toBe("#FB9D72");
    expect(tabelas.ROSTO.Morena).toBe(0.6);
  });

  it("diz qual declaração falta ou não é literal", () => {
    expect(
      erroDe(() =>
        decodificarTabelasDaPagina(fonte.replace("const REF", "const OUTRA"), "corpos.html"),
      ).campo,
    ).toBe("REF");
    expect(
      erroDe(() =>
        decodificarTabelasDaPagina(fonte.replace('"#FFB69F"', "corDaPele()"), "corpos.html"),
      ).campo,
    ).toBe("TONS");
  });
});

describe("imagens", () => {
  it("o PNG volta com os mesmos pixels e sai sempre com os mesmos bytes", () => {
    const dados = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]);
    const pasta = mkdtempSync(join(tmpdir(), "morada-arte-"));
    try {
      const png = escreverPng({ largura: 2, altura: 2, dados });
      expect(Array.from(escreverPng({ largura: 2, altura: 2, dados }))).toEqual(Array.from(png));
      writeFileSync(join(pasta, "a.png"), png);
      const lida = lerPng(join(pasta, "a.png"));
      expect(Array.from(lida.dados)).toEqual(Array.from(dados));
      expect(amostrar(lida, 0.25, 0.25, "proximo", "segura").slice(0, 3)).toEqual([255, 0, 0]);
      expect(amostrar(lida, 0.5, 0.25, "bilinear", "segura")[0]).toBeCloseTo(127.5, 5);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe("corpo em GLB", () => {
  let pasta = "";
  beforeAll(async () => {
    pasta = await fabricarArte(mkdtempSync(join(tmpdir(), "morada-arte-")));
  });
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  it("lê esqueleto, malhas, formas e a altura", () => {
    const corpo = lerCorpo(join(pasta, "biblioteca/corpos/boneco.glb"), "boneco");
    expect(corpo.ossos.map((o) => o.nome)).toContain("Head");
    expect(corpo.ossos.find((o) => o.nome === "Hips")?.pai).toBe(
      corpo.ossos.findIndex((o) => o.nome === "Root"),
    );
    expect(corpo.malhas.map((m) => m.nome)).toContain("boneco_rosto_neutro");
    const rosto = corpo.malhas.find((m) => m.nome === "boneco_rosto_neutro");
    expect(rosto?.primitivas.map((p) => p.material)).toEqual(["Rosto", "Boca"]);
    expect(rosto?.primitivas[0]?.formas.map((f) => f.nome)).toEqual(["fala_A", "fala_O"]);
    expect(corpo.altura).toBeCloseTo(0.85, 5);
  });

  it("normaliza os pesos como o three faz ao carregar", () => {
    expect(Array.from(normalizarPesos(Float32Array.from([2, 2, 0, 0, 0, 0, 0, 0])))).toEqual([
      0.5, 0.5, 0, 0, 1, 0, 0, 0,
    ]);
  });

  it("a biblioteca reclama da pasta errada e de um corpo que não existe", () => {
    expect(erroDe(() => new Biblioteca(join(pasta, "nao-existe"))).message).toContain(
      "ARTES_3D_DIR",
    );
    expect(erroDe(() => new Biblioteca(pasta).corpo("fantasma")).message).toContain("fantasma");
    expect(erroDe(() => new Biblioteca(pasta).item("../segredo")).message).toContain("não é um id");
  });
});
