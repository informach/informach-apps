import {
  type Accessor,
  Document,
  Logger,
  type Material,
  type Mesh,
  NodeIO,
  type Skin,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { quantize, reorder } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import type { Pesos } from "../encaixe/montar";
import type { Corpo } from "../leitura/corpo";
import { escreverPng } from "../leitura/imagem";
import { em } from "../numeros";
import type { PersonagemMontado } from "../personagem/montagem";
import type { PrimitivaPronta } from "../personagem/partes";

/**
 * Escreve o GLB de um personagem: um esqueleto, uma skin, a malha do corpo,
 * uma malha por expressão do rosto (só uma aparece por vez) e a chupeta.
 * Geometria quantizada (`KHR_mesh_quantization`) e comprimida
 * (`EXT_meshopt_compression`), sem animações: os clipes vêm da biblioteca do
 * esqueleto.
 */

export type OpcoesDeEscrita = {
  /** Bits da posição (a caixa do personagem inteiro dividida em 2^bits passos). */
  bitsDaPosicao: number;
  bitsDoUv: number;
};

export const ESCRITA_PADRAO: OpcoesDeEscrita = { bitsDaPosicao: 14, bitsDoUv: 12 };

/** Nomes dos atributos com os pesos das poses dobradas (o three os entrega em minúsculas). */
export const ATRIBUTO_OSSOS_DOBRADO = "_JOINTS_DOBRADO";
export const ATRIBUTO_PESOS_DOBRADO = "_WEIGHTS_DOBRADO";

let io: Promise<NodeIO> | null = null;

/** O leitor e escritor de GLB com o codificador do Meshopt pronto. */
export function entradaESaida(): Promise<NodeIO> {
  io ??= (async () => {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
  })();
  return io;
}

/** Pesos em bytes que somam 255 em cada vértice (o resto do arredondamento vai para o maior). */
export function pesosEmBytes(pesos: Float32Array): Uint8Array {
  const saida = new Uint8Array(pesos.length);
  for (let i = 0; i < pesos.length; i += 4) {
    let soma = 0;
    for (let k = 0; k < 4; k++) soma += em(pesos, i + k);
    if (soma <= 0) {
      saida[i] = 255;
      continue;
    }
    let total = 0;
    let maior = 0;
    for (let k = 0; k < 4; k++) {
      const byte = Math.round((em(pesos, i + k) / soma) * 255);
      saida[i + k] = byte;
      total += byte;
      if (byte > em(saida, i + maior)) maior = k;
    }
    saida[i + maior] = em(saida, i + maior) + (255 - total);
  }
  return saida;
}

type Contexto = {
  doc: Document;
  acessor(
    nome: string,
    tipo: Accessor["getType"] extends () => infer T ? T : never,
    dados: ArrayLike<number> & ArrayBufferView,
  ): Accessor;
  cores: Material;
  inteiras: boolean;
};

function primitivaNoDocumento(
  ctx: Contexto,
  primitiva: PrimitivaPronta,
  nome: string,
  formasComNormais: boolean,
) {
  const { doc } = ctx;
  const prim = doc
    .createPrimitive()
    .setIndices(ctx.acessor(`${nome}.indices`, "SCALAR", primitiva.indices))
    .setAttribute("POSITION", ctx.acessor(`${nome}.posicoes`, "VEC3", primitiva.posicoes))
    .setAttribute("NORMAL", ctx.acessor(`${nome}.normais`, "VEC3", primitiva.normais))
    .setAttribute("JOINTS_0", ctx.acessor(`${nome}.ossos`, "VEC4", primitiva.pesos.ossos))
    .setAttribute("WEIGHTS_0", ctx.acessor(`${nome}.pesos`, "VEC4", primitiva.pesos.pesos));
  if (primitiva.cores) {
    if (ctx.inteiras) {
      const cores = new Uint16Array(primitiva.cores.length);
      for (let i = 0; i < cores.length; i++) {
        cores[i] = Math.round(Math.min(Math.max(em(primitiva.cores, i), 0), 1) * 65535);
      }
      prim.setAttribute("COLOR_0", ctx.acessor(`${nome}.cores`, "VEC3", cores).setNormalized(true));
    } else {
      prim.setAttribute("COLOR_0", ctx.acessor(`${nome}.cores`, "VEC3", primitiva.cores));
    }
    prim.setMaterial(ctx.cores);
  }
  if (primitiva.uv && primitiva.textura) {
    prim.setAttribute("TEXCOORD_0", ctx.acessor(`${nome}.uv`, "VEC2", primitiva.uv));
    const textura = doc
      .createTexture(`${nome}.textura`)
      .setImage(escreverPng(primitiva.textura))
      .setMimeType("image/png");
    const material = doc
      .createMaterial(`Estampa_${nome}`)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.75)
      .setDoubleSided(true)
      .setBaseColorTexture(textura);
    // como a página carrega as texturas: sem repetir
    material
      .getBaseColorTextureInfo()
      ?.setWrapS(33071)
      .setWrapT(33071)
      .setMagFilter(9729)
      .setMinFilter(9987);
    prim.setMaterial(material);
  }
  if (primitiva.dobrado) {
    const dobrado: Pesos = primitiva.dobrado;
    prim.setAttribute(
      ATRIBUTO_OSSOS_DOBRADO,
      ctx.acessor(`${nome}.ossos_dobrado`, "VEC4", Uint8Array.from(dobrado.ossos)),
    );
    prim.setAttribute(
      ATRIBUTO_PESOS_DOBRADO,
      ctx.acessor(`${nome}.pesos_dobrado`, "VEC4", pesosEmBytes(dobrado.pesos)).setNormalized(true),
    );
  }
  for (const forma of primitiva.formas) {
    const alvo = doc.createPrimitiveTarget(forma.nome);
    alvo.setAttribute(
      "POSITION",
      ctx.acessor(`${nome}.${forma.nome}.posicoes`, "VEC3", forma.posicoes),
    );
    if (formasComNormais && forma.normais) {
      alvo.setAttribute(
        "NORMAL",
        ctx.acessor(`${nome}.${forma.nome}.normais`, "VEC3", forma.normais),
      );
    }
    prim.addTarget(alvo);
  }
  return prim;
}

function esqueletoNoDocumento(
  doc: Document,
  corpo: Corpo,
  acessor: Contexto["acessor"],
): { skin: Skin; raiz: ReturnType<Document["createNode"]> } {
  const armadura = doc
    .createNode("Armadura")
    .setTranslation(corpo.armadura.translacao)
    .setRotation(corpo.armadura.rotacao)
    .setScale(corpo.armadura.escala);
  const nos = corpo.ossos.map((osso) =>
    doc
      .createNode(osso.nome)
      .setTranslation(osso.translacao)
      .setRotation(osso.rotacao)
      .setScale(osso.escala),
  );
  corpo.ossos.forEach((osso, i) => {
    const no = nos[i];
    if (!no) return;
    const pai = osso.pai < 0 ? armadura : nos[osso.pai];
    pai?.addChild(no);
  });
  const skin = doc
    .createSkin("esqueleto")
    .setInverseBindMatrices(acessor("esqueleto.inversas", "MAT4", corpo.inversas));
  for (const no of nos) skin.addJoint(no);
  return { skin, raiz: armadura };
}

export type MalhaEscrita = { no: string; triangulos: number; vertices: number; primitivas: number };

export type PersonagemEscrito = {
  glb: Uint8Array;
  malhas: MalhaEscrita[];
};

export async function escreverPersonagem(
  montado: PersonagemMontado,
  opcoes: OpcoesDeEscrita = ESCRITA_PADRAO,
): Promise<PersonagemEscrito> {
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  doc.getRoot().getAsset().generator = "@informach/morada-arte";
  const buffer = doc.createBuffer();
  const acessor: Contexto["acessor"] = (nome, tipo, dados) =>
    doc
      .createAccessor(nome)
      .setType(tipo)
      .setArray(dados as Parameters<Accessor["setArray"]>[0])
      .setBuffer(buffer);
  // Os corpos da biblioteca são desenhados dos dois lados; as peças montadas ganham o mesmo material,
  // e com isso o avesso de uma saia ou de uma manga aparece como pano em vez de deixar ver através.
  const cores = doc
    .createMaterial("Cores")
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.75)
    .setDoubleSided(true);
  const ctx: Contexto = { doc, acessor, cores, inteiras: montado.relatorio.corMaxima <= 1 };
  const { skin, raiz } = esqueletoNoDocumento(doc, montado.corpo, acessor);
  const cena = doc.createScene(montado.plano.personagem.id).addChild(raiz);
  doc.getRoot().setDefaultScene(cena);
  const malhas: MalhaEscrita[] = [];
  const pendurar = (
    nome: string,
    primitivas: readonly PrimitivaPronta[],
    formas: readonly string[],
    comNormais: boolean,
  ): Mesh => {
    const malha = doc.createMesh(nome);
    primitivas.forEach((p, k) => {
      malha.addPrimitive(
        primitivaNoDocumento(ctx, p, primitivas.length > 1 ? `${nome}_${k}` : nome, comNormais),
      );
    });
    if (formas.length > 0) {
      malha.setWeights(formas.map(() => 0));
      malha.setExtras({ targetNames: [...formas] });
    }
    cena.addChild(doc.createNode(nome).setMesh(malha).setSkin(skin));
    malhas.push({
      no: nome,
      triangulos: primitivas.reduce((s, p) => s + p.indices.length / 3, 0),
      vertices: primitivas.reduce((s, p) => s + p.posicoes.length / 3, 0),
      primitivas: primitivas.length,
    });
    return malha;
  };
  pendurar("corpo", montado.primitivas, montado.gravidez, true);
  for (const rosto of montado.rostos) {
    pendurar(
      `rosto_${rosto.expressao}`,
      [rosto.primitiva],
      rosto.primitiva.formas.map((f) => f.nome),
      false,
    );
  }
  if (montado.chupeta) pendurar("chupeta", [montado.chupeta], [], false);

  await doc.transform(
    reorder({ encoder: MeshoptEncoder, target: "size" }),
    quantize({
      pattern: /^(POSITION|TEXCOORD|JOINTS|WEIGHTS)(_\d+)?$/,
      patternTargets: /^(POSITION|NORMAL)$/,
      quantizePosition: opcoes.bitsDaPosicao,
      quantizeTexcoord: opcoes.bitsDoUv,
      quantizeWeight: 8,
      quantizeNormal: 8,
      quantizationVolume: "scene",
    }),
  );
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = await (await entradaESaida()).writeBinary(doc);
  return { glb, malhas };
}
