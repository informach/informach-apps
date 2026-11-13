import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import { caminhoInterno, empacotarAmbiente } from "../src/ambiente";
import { escreverPng } from "../src/leitura/imagem";
import { arquivosDoManifesto, ManifestoSchema } from "../src/manifesto";
import { entradaESaida } from "../src/saida/glb";

const pastas: string[] = [];
const nova = () => {
  const p = mkdtempSync(join(tmpdir(), "morada-ambiente-"));
  pastas.push(p);
  return p;
};
const gravar = (p: string, d: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(d));
};
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

async function modelo(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const plano = (nome: string, y: number) => {
    const prim = doc
      .createPrimitive()
      .setAttribute(
        "POSITION",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(new Float32Array([-1, y, -1, 1, y, -1, 1, y, 1, -1, y, 1]))
          .setBuffer(buffer),
      )
      .setIndices(
        doc
          .createAccessor()
          .setType("SCALAR")
          .setArray(new Uint16Array([0, 2, 1, 0, 3, 2]))
          .setBuffer(buffer),
      );
    const material = doc
      .createMaterial(nome)
      .setAlphaMode("BLEND")
      .setBaseColorFactor([1, 0, 0, 0.5]);
    return doc.createNode(nome).setMesh(doc.createMesh().addPrimitive(prim.setMaterial(material)));
  };
  const raiz = plano("assento", 0.45);
  const dobradica = doc.createNode("porta").setExtras({ interativo: "porta", angulo: 1.2 });
  raiz.addChild(dobradica);
  doc.createScene().addChild(raiz).addChild(plano("encosto", 1.2));
  return new NodeIO().writeBinary(doc);
}

const casa = {
  objetos: [
    { catalogo: "sofa_teste", versao: 1 },
    { catalogo: "sofa_teste", versao: 1 },
  ],
  andares: [
    {
      comodos: [{ piso: "piso_teste", parede: "parede_teste" }],
      aberturas: [{ tipo: "porta", largura: 900, altura: 2100, peitoril: 0 }],
    },
  ],
};

async function biblioteca(): Promise<string> {
  const p = nova();
  const bytes = await modelo();
  gravar(join(p, "biblioteca/moveis/sofas/catalogo.json"), {
    itens: [{ id: "sofa_teste", grupo: "sofa", arquivo: "glb/sofa_teste.glb" }],
  });
  mkdirSync(join(p, "biblioteca/moveis/sofas/glb"));
  writeFileSync(join(p, "biblioteca/moveis/sofas/glb/sofa_teste.glb"), bytes);
  gravar(join(p, "biblioteca/construcao/construcao.json"), {
    paredes: [{ id: "porta", vaos: [{ larg: 0.9, alt: 2.1, peitoril: 0 }] }],
    escala_textura: { piso: 2, parede: 3 },
  });
  gravar(join(p, "biblioteca/construcao/portas_janelas.json"), {
    portas: [
      {
        id: "porta_teste",
        arquivo: "pecas/porta.glb",
        cor: "branca",
        vao: { peca: "porta", indice: 0 },
        batente: "batente_teste",
      },
    ],
    janelas: [],
    batentes: [{ id: "batente_teste", arquivo: "pecas/batente.glb" }],
  });
  mkdirSync(join(p, "biblioteca/construcao/pecas"));
  for (const n of ["porta", "batente"])
    writeFileSync(join(p, `biblioteca/construcao/pecas/${n}.glb`), bytes);
  mkdirSync(join(p, "biblioteca/construcao/texturas"));
  const png = escreverPng({ largura: 1, altura: 1, dados: new Uint8Array([255, 0, 0, 255]) });
  for (const n of ["piso_teste", "parede_teste"])
    writeFileSync(join(p, `biblioteca/construcao/texturas/${n}.png`), png);
  return p;
}

describe("empacotamento do ambiente sem arte licenciada", () => {
  it("seleciona pela planta, mede o assento, preserva transparência e pivôs e é determinístico", async () => {
    const arte = await biblioteca();
    const a = nova(),
      b = nova();
    const m = await empacotarAmbiente(arte, a, casa);
    await empacotarAmbiente(arte, b, casa);
    expect(m.objetos).toHaveLength(1);
    expect(m.acabamentos).toHaveLength(2);
    expect(m.aberturas).toHaveLength(1);
    expect(m.objetos[0]?.apoios.sentar_1).toBe(0.45);
    expect(readdirSync(a)).toEqual(readdirSync(b));
    for (const nome of readdirSync(a)) {
      const bytes = readFileSync(join(a, nome));
      expect(bytes).toEqual(readFileSync(join(b, nome)));
      expect(nome).toContain(createHash("sha256").update(bytes).digest("hex").slice(0, 10));
    }
    const glb = m.objetos[0]?.arquivo;
    if (!glb) throw new Error("modelo ausente");
    const doc = await (await entradaESaida()).read(join(a, glb));
    expect(
      doc
        .getRoot()
        .listNodes()
        .find((x) => x.getName() === "porta")
        ?.getExtras(),
    ).toMatchObject({ interativo: "porta", angulo: 1.2 });
    expect(doc.getRoot().listMaterials()[0]?.getAlphaMode()).toBe("BLEND");
    const manifesto = ManifestoSchema.parse({
      formato: "morada-arte",
      versao: 2,
      arte: { repositorio: "teste", commit: null },
      personagens: [],
      bibliotecas: [],
      ...m,
    });
    expect(arquivosDoManifesto(manifesto)).toHaveLength(5);
  });

  it("lê V1, exige os campos de V2 e recusa referências de arquivo inseguras", () => {
    const v1 = {
      formato: "morada-arte",
      versao: 1,
      arte: { repositorio: "teste", commit: null },
      personagens: [],
      bibliotecas: [],
    };
    expect(ManifestoSchema.parse(v1).versao).toBe(1);
    expect(ManifestoSchema.safeParse({ ...v1, versao: 2 }).success).toBe(false);
    const v2 = {
      ...v1,
      versao: 2,
      objetos: [],
      aberturas: [],
      acabamentos: [{ id: "x", arquivo: "../x.png", bytes: 1, escala: 2 }],
    };
    expect(ManifestoSchema.safeParse(v2).success).toBe(false);
  });

  it("recusa id inexistente, caminho fora da entrada e link para fora", async () => {
    const arte = await biblioteca();
    await expect(
      empacotarAmbiente(arte, nova(), {
        ...casa,
        objetos: [{ catalogo: "nao_existe", versao: 1 }],
      }),
    ).rejects.toThrow("não há modelo");
    const fora = join(nova(), "privado.glb");
    writeFileSync(fora, "fora");
    expect(() => caminhoInterno(arte, fora)).toThrow("dentro");
    symlinkSync(fora, join(arte, "link.glb"));
    expect(() => caminhoInterno(arte, "link.glb")).toThrow("dentro");
  });

  it("recusa um GLB com recurso externo antes de pedir a leitura", async () => {
    const arte = await biblioteca();
    const caminho = join(arte, "biblioteca/moveis/sofas/glb/sofa_teste.glb");
    const json = Buffer.from(
      JSON.stringify({
        asset: { version: "2.0" },
        images: [{ uri: "https://example.invalid/textura.png" }],
      }),
    );
    const bytes = Buffer.alloc(20 + json.length);
    bytes.writeUInt32LE(0x46546c67, 0);
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(json.length, 12);
    json.copy(bytes, 20);
    writeFileSync(caminho, bytes);
    await expect(empacotarAmbiente(arte, nova(), casa)).rejects.toThrow("sem URI externa");
  });
});
