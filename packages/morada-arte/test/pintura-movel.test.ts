import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document } from "@gltf-transform/core";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { empacotarAmbiente } from "../src/ambiente";
import { hexParaLinear, luminancia } from "../src/cor/cores";
import { ATRIBUTO_MASCARA_PINTURA, ATRIBUTO_PESO_PINTURA, ManifestoSchema } from "../src/manifesto";
import { prepararPinturaDoMovel, type ReceitaDePintura } from "../src/movel/pintura";
import { entradaESaida } from "../src/saida/glb";

const origem = "a".repeat(64);
const receita: ReceitaDePintura = {
  catalogo: "mesa_sintetica",
  versaoDoCatalogo: 1,
  sha256Origem: origem,
  rotulo: "Estrutura",
  materiais: ["atlas"],
  pigmentos: [
    [200, 100, 50],
    [100, 50, 25],
  ],
};

function modelo() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const png = new PNG({ width: 16, height: 16 });
  png.data.fill(255);
  png.data.set([200, 100, 50, 255], 0);
  png.data.set([100, 50, 25, 255], 4);
  png.data.set([30, 60, 90, 255], 8);
  const imagem = PNG.sync.write(png);
  const textura = doc.createTexture().setMimeType("image/png").setImage(imagem);
  const atlas = doc.createMaterial("atlas").setBaseColorTexture(textura);
  atlas.getBaseColorTextureInfo()?.setMagFilter(9728).setMinFilter(9984);
  const vidro = doc
    .createMaterial("vidro")
    .setAlphaMode("BLEND")
    .setBaseColorFactor([0.3, 0.6, 0.9, 0.38]);
  const pos = doc
    .createAccessor()
    .setType("VEC3")
    .setBuffer(buffer)
    .setArray(new Float32Array(Array.from({ length: 9 }, (_, i) => [i, 0, i % 3]).flat()));
  const uv = doc
    .createAccessor()
    .setType("VEC2")
    .setBuffer(buffer)
    .setArray(
      new Float32Array(
        Array.from({ length: 9 }, (_, i) => [(Math.floor(i / 3) + 0.5) / 16, 0.5 / 16]).flat(),
      ),
    );
  const prim = doc
    .createPrimitive()
    .setMaterial(atlas)
    .setAttribute("POSITION", pos)
    .setAttribute("TEXCOORD_0", uv);
  const transparente = doc.createPrimitive().setMaterial(vidro).setAttribute("POSITION", pos);
  doc
    .createScene()
    .addChild(
      doc.createNode().setMesh(doc.createMesh().addPrimitive(prim).addPrimitive(transparente)),
    );
  return { doc, prim, transparente, atlas, vidro, textura, imagem, pos, uv };
}

describe("perfil de pintura dos móveis, sem arte licenciada", () => {
  it("empacota o perfil explicitamente, preservando pesos float32 na compressão real", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "morada-pintura-"));
    try {
      const arte = join(pasta, "arte"),
        saida = join(pasta, "saida");
      const moveis = join(arte, "biblioteca/moveis/mesas"),
        construcao = join(arte, "biblioteca/construcao");
      for (const p of [moveis, construcao, saida]) mkdirSync(p, { recursive: true });
      const json = (p: string, dado: unknown) => writeFileSync(p, JSON.stringify(dado));
      const io = await entradaESaida();
      const bytes = await io.writeBinary(modelo().doc);
      writeFileSync(join(moveis, "mesa.glb"), bytes);
      json(join(moveis, "catalogo.json"), {
        itens: [{ id: receita.catalogo, arquivo: "mesa.glb" }],
      });
      json(join(construcao, "construcao.json"), {
        paredes: [],
        escala_textura: { piso: 1, parede: 1 },
      });
      json(join(construcao, "portas_janelas.json"), { portas: [], janelas: [], batentes: [] });
      const casa = { objetos: [{ catalogo: receita.catalogo, versao: 1 }], andares: [] };
      const perfis = {
        formato: "morada.perfis-pintura",
        versao: 1,
        perfis: [{ ...receita, sha256Origem: createHash("sha256").update(bytes).digest("hex") }],
      };
      const pacote = await empacotarAmbiente(arte, saida, casa, perfis);
      const objeto = pacote.objetos[0];
      if (!objeto) throw new Error("O móvel não foi empacotado");
      expect(objeto.pintura?.perfil).toMatch(/^[a-f0-9]{64}$/);
      const lido = await io.read(join(saida, objeto.arquivo));
      const prim = lido.getRoot().listMeshes()[0]?.listPrimitives()[0];
      const pesos = prim?.getAttribute(ATRIBUTO_PESO_PINTURA);
      expect(pesos?.getArray()).toBeInstanceOf(Float32Array);
      // Reordenação de vértices pode alterar a ordem, mas não a luminância de cada região.
      expect(Array.from(pesos?.getArray() ?? []).sort()).toEqual(
        Array.from(
          new Float32Array([
            1,
            1,
            1,
            luminancia(hexParaLinear("#643219")) / luminancia(hexParaLinear("#c86432")),
            luminancia(hexParaLinear("#643219")) / luminancia(hexParaLinear("#c86432")),
            luminancia(hexParaLinear("#643219")) / luminancia(hexParaLinear("#c86432")),
            0,
            0,
            0,
          ]),
        ).sort(),
      );
      const legado = await empacotarAmbiente(arte, saida, casa);
      expect(legado.objetos[0]?.pintura).toBeUndefined();
      await expect(
        empacotarAmbiente(arte, saida, casa, { ...perfis, perfis: [receita] }),
      ).rejects.toThrow(/origem mudou/);
      await expect(
        empacotarAmbiente(arte, saida, { ...casa, objetos: [] }, perfis),
      ).rejects.toThrow(/fora das peças/);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("delimita pigmentos, conserva os detalhes, a textura e o vidro, inclusive após GLB", async () => {
    const m = modelo();
    const pos = Array.from(m.pos.getArray() ?? []),
      uv = Array.from(m.uv.getArray() ?? []);
    const pintura = prepararPinturaDoMovel(m.doc, receita, origem);
    expect(pintura.referencia).toBe(0xc86432);
    expect(m.prim.getAttribute(ATRIBUTO_MASCARA_PINTURA)?.getArray()).toEqual(
      new Float32Array([1, 1, 1, 1, 1, 1, 0, 0, 0]),
    );
    const pesos = m.prim.getAttribute(ATRIBUTO_PESO_PINTURA);
    expect(pesos?.getScalar(0)).toBe(1);
    expect(pesos?.getScalar(3)).toBeCloseTo(
      luminancia(hexParaLinear("#643219")) / luminancia(hexParaLinear("#c86432")),
      6,
    );
    expect(pesos?.getScalar(6)).toBe(0);
    expect(Array.from(m.pos.getArray() ?? [])).toEqual(pos);
    expect(Array.from(m.uv.getArray() ?? [])).toEqual(uv);
    expect(m.textura.getImage()).toEqual(m.imagem);
    expect(m.atlas.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
    expect(m.transparente.getAttribute(ATRIBUTO_MASCARA_PINTURA)).toBeNull();
    expect(m.vidro.getExtras()).toEqual({});
    const io = await entradaESaida();
    const lido = await io.readBinary(await io.writeBinary(m.doc));
    expect(lido.getRoot().listTextures()[0]?.getImage()).toEqual(m.imagem);
    expect(
      lido
        .getRoot()
        .listMaterials()
        .find((x) => x.getName() === "vidro")
        ?.getBaseColorFactor(),
    ).toEqual([0.3, 0.6, 0.9, 0.38]);
    expect(
      lido
        .getRoot()
        .listMeshes()[0]
        ?.listPrimitives()[0]
        ?.getAttribute(ATRIBUTO_PESO_PINTURA)
        ?.getScalar(3),
    ).toBeCloseTo(pesos?.getScalar(3) ?? -1, 7);
  });

  it("identifica o mesmo perfil independentemente da ordem e recusa uma origem alterada", () => {
    expect(prepararPinturaDoMovel(modelo().doc, receita, origem)).toEqual(
      prepararPinturaDoMovel(
        modelo().doc,
        { ...receita, pigmentos: [...receita.pigmentos].reverse() },
        origem,
      ),
    );
    expect(() => prepararPinturaDoMovel(modelo().doc, receita, "b".repeat(64))).toThrow(
      /origem mudou/,
    );
    expect(() =>
      prepararPinturaDoMovel(modelo().doc, { ...receita, pigmentos: [[1, 2, 3]] }, origem),
    ).toThrow(/não aparece/);
  });

  it("recusa mistura de texels no triângulo, UV não central e atlas filtrado", () => {
    const misto = modelo();
    misto.uv.setElement(0, [1.5 / 16, 0.5 / 16]);
    expect(() => prepararPinturaDoMovel(misto.doc, receita, origem)).toThrow(/mistura texels/);
    const deslocado = modelo();
    deslocado.uv.setElement(0, [0.6 / 16, 0.5 / 16]);
    expect(() => prepararPinturaDoMovel(deslocado.doc, receita, origem)).toThrow(/centro de texel/);
    const filtrado = modelo();
    filtrado.atlas.getBaseColorTextureInfo()?.setMagFilter(9729);
    expect(() => prepararPinturaDoMovel(filtrado.doc, receita, origem)).toThrow(/filtro/);
  });

  it("exige V4 para anunciar pintura e conserva os perfis anteriores", () => {
    const base = {
      formato: "morada-arte",
      arte: { repositorio: "teste", commit: null },
      personagens: [],
      bibliotecas: [],
      acabamentos: [],
      aberturas: [],
    };
    const objeto = {
      id: "mesa_sintetica",
      versao: 1,
      arquivo: "mesa.0123456789.glb",
      bytes: 1,
      limites: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      apoios: {},
      desenho: { chamadas: 1, triangulos: 3, vertices: 9, texturas: 1 },
    };
    const pintura = prepararPinturaDoMovel(modelo().doc, receita, origem);
    expect(
      ManifestoSchema.safeParse({ ...base, versao: 4, objetos: [{ ...objeto, pintura }] }).success,
    ).toBe(true);
    expect(
      ManifestoSchema.safeParse({ ...base, versao: 3, objetos: [{ ...objeto, pintura }] }).success,
    ).toBe(false);
    expect(ManifestoSchema.safeParse({ ...base, versao: 3, objetos: [objeto] }).success).toBe(true);
  });
});
