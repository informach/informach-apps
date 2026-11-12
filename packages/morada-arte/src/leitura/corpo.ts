import { ErroDeArte } from "../erros";
import { em, item, type Vec3 } from "../numeros";
import { ArquivoGlb } from "./glb";

/** Um corpo da biblioteca (`biblioteca/corpos/<id>.glb`) em vetores simples, no espaço do glTF. */

export type Quat = [number, number, number, number];

export type Forma = {
  nome: string;
  /** Deslocamento de cada vértice em relação à malha de base. */
  posicoes: Float32Array;
  normais: Float32Array | null;
};

export type Primitiva = {
  material: string;
  posicoes: Float32Array;
  normais: Float32Array;
  uv: Float32Array | null;
  /**
   * Cor por vértice do arquivo (`COLOR_0`), três números lineares por vértice. O three liga
   * `vertexColors` no material quando ela existe, e a cor multiplica a do material.
   */
  cores: Float32Array | null;
  /** Quatro ossos por vértice, pelo índice na lista de ossos do corpo. */
  ossos: Uint16Array;
  /** Quatro pesos por vértice, já normalizados como o three faz ao carregar. */
  pesos: Float32Array;
  indices: Uint32Array;
  formas: Forma[];
};

export type MalhaDoCorpo = {
  nome: string;
  primitivas: Primitiva[];
};

export type Osso = {
  nome: string;
  /** Índice do osso pai; -1 no osso preso direto à armadura. */
  pai: number;
  translacao: Vec3;
  rotacao: Quat;
  escala: Vec3;
};

export type Armadura = {
  nome: string;
  translacao: Vec3;
  rotacao: Quat;
  escala: Vec3;
};

export type Corpo = {
  id: string;
  arquivo: string;
  armadura: Armadura;
  ossos: Osso[];
  /** Matrizes inversas de ligação, 16 números por osso, por colunas. */
  inversas: Float32Array;
  malhas: MalhaDoCorpo[];
  /** Altura da caixa de todas as malhas do arquivo, como a página mede (`altura`). */
  altura: number;
  /** Menor Y dessa caixa: a página desce a raiz este tanto para os pés tocarem o chão. */
  chao: number;
};

/**
 * Normaliza os quatro pesos de cada vértice pela soma deles, em 32 bits, como
 * `SkinnedMesh.normalizeSkinWeights()` do three: são esses os pesos que a
 * página usa ao montar uma peça.
 */
export function normalizarPesos(pesos: Float32Array): Float32Array {
  const saida = new Float32Array(pesos.length);
  for (let i = 0; i < pesos.length; i += 4) {
    const x = em(pesos, i);
    const y = em(pesos, i + 1);
    const z = em(pesos, i + 2);
    const w = em(pesos, i + 3);
    const escala = 1.0 / (Math.abs(x) + Math.abs(y) + Math.abs(z) + Math.abs(w));
    if (escala !== Number.POSITIVE_INFINITY) {
      saida[i] = x * escala;
      saida[i + 1] = y * escala;
      saida[i + 2] = z * escala;
      saida[i + 3] = w * escala;
    } else {
      saida[i] = 1;
    }
  }
  return saida;
}

export function lerCorpo(caminho: string, id: string): Corpo {
  const glb = new ArquivoGlb(caminho);
  try {
    return montarCorpo(glb, id);
  } finally {
    glb.fechar();
  }
}

function montarCorpo(glb: ArquivoGlb, id: string): Corpo {
  const { json, arquivo } = glb;
  const skin = json.skins?.[0];
  if (!skin || (json.skins?.length ?? 0) !== 1) {
    throw new ErroDeArte(arquivo, "esperava exatamente uma skin", "skins");
  }
  if (skin.inverseBindMatrices === undefined) {
    throw new ErroDeArte(arquivo, "a skin não traz as matrizes de ligação", "skins.0");
  }
  const pais = new Map<number, number>();
  json.nodes.forEach((no, indice) => {
    for (const filho of no.children ?? []) pais.set(filho, indice);
  });
  const indiceDoOsso = new Map(skin.joints.map((no, k) => [no, k] as const));
  let noDaArmadura = -1;
  const ossos: Osso[] = skin.joints.map((indiceDoNo) => {
    const no = glb.no(indiceDoNo);
    if (no.matrix)
      throw new ErroDeArte(arquivo, "osso com matriz em vez de TRS", `nodes.${indiceDoNo}`);
    const pai = pais.get(indiceDoNo);
    const paiOsso = pai === undefined ? undefined : indiceDoOsso.get(pai);
    if (paiOsso === undefined) {
      if (pai === undefined)
        throw new ErroDeArte(arquivo, "osso sem nó pai", `nodes.${indiceDoNo}`);
      if (noDaArmadura >= 0 && noDaArmadura !== pai) {
        throw new ErroDeArte(arquivo, "esqueleto com mais de uma raiz", "skins.0.joints");
      }
      noDaArmadura = pai;
    }
    return {
      nome: no.name ?? `osso_${indiceDoNo}`,
      pai: paiOsso ?? -1,
      translacao: no.translation ?? [0, 0, 0],
      rotacao: no.rotation ?? [0, 0, 0, 1],
      escala: no.scale ?? [1, 1, 1],
    };
  });
  if (noDaArmadura < 0) throw new ErroDeArte(arquivo, "não achei o nó da armadura", "skins.0");
  if (pais.has(noDaArmadura)) {
    throw new ErroDeArte(arquivo, "a armadura não está na raiz da cena", `nodes.${noDaArmadura}`);
  }
  const noArmadura = glb.no(noDaArmadura);
  const armadura: Armadura = {
    nome: noArmadura.name ?? id,
    translacao: noArmadura.translation ?? [0, 0, 0],
    rotacao: noArmadura.rotation ?? [0, 0, 0, 1],
    escala: noArmadura.scale ?? [1, 1, 1],
  };
  const inversas = glb.reais(skin.inverseBindMatrices, "skins.0.inverseBindMatrices");
  if (inversas.length !== ossos.length * 16) {
    throw new ErroDeArte(arquivo, "matrizes de ligação em número diferente dos ossos", "skins.0");
  }

  const materiais = json.materials ?? [];
  const malhas: MalhaDoCorpo[] = [];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  json.nodes.forEach((no, indiceDoNo) => {
    if (no.mesh === undefined) return;
    const campo = `nodes.${indiceDoNo} (${no.name ?? "sem nome"})`;
    if (no.skin !== 0) throw new ErroDeArte(arquivo, "malha sem a skin do corpo", campo);
    if (no.translation || no.rotation || no.scale || no.matrix) {
      throw new ErroDeArte(arquivo, "malha com transformação própria", campo);
    }
    const malha = item(json.meshes ?? [], no.mesh);
    const nomesDasFormas = malha.extras?.targetNames ?? [];
    const primitivas: Primitiva[] = malha.primitives.map((prim, k) => {
      const onde = `${campo}.primitives.${k}`;
      if (prim.mode !== undefined && prim.mode !== 4) {
        throw new ErroDeArte(arquivo, "só triângulos são suportados", onde);
      }
      const atributo = (nome: string): number => {
        const indice = prim.attributes[nome];
        if (indice === undefined) throw new ErroDeArte(arquivo, `falta o atributo ${nome}`, onde);
        return indice;
      };
      const posicoes = glb.reais(atributo("POSITION"), `${onde}.POSITION`);
      const vertices = posicoes.length / 3;
      const uvIndice = prim.attributes.TEXCOORD_0;
      if (prim.indices === undefined) throw new ErroDeArte(arquivo, "primitiva sem índices", onde);
      const formas: Forma[] = (prim.targets ?? []).map((alvo, f) => {
        const nome = nomesDasFormas[f];
        if (!nome) throw new ErroDeArte(arquivo, `forma ${f} sem nome`, `${onde}.targets`);
        if (alvo.POSITION === undefined) {
          throw new ErroDeArte(arquivo, `forma ${nome} sem posições`, `${onde}.targets.${f}`);
        }
        return {
          nome,
          posicoes: glb.reais(alvo.POSITION, `${onde}.targets.${f}.POSITION`),
          normais:
            alvo.NORMAL === undefined
              ? null
              : glb.reais(alvo.NORMAL, `${onde}.targets.${f}.NORMAL`),
        };
      });
      const ossosDoVertice = Uint16Array.from(
        glb.inteiros(atributo("JOINTS_0"), `${onde}.JOINTS_0`),
      );
      const pesos = glb.reais(atributo("WEIGHTS_0"), `${onde}.WEIGHTS_0`);
      if (ossosDoVertice.length !== vertices * 4 || pesos.length !== vertices * 4) {
        throw new ErroDeArte(arquivo, "ossos e pesos em número diferente dos vértices", onde);
      }
      for (let i = 1; i < posicoes.length; i += 3) {
        const y = em(posicoes, i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return {
        material: (prim.material === undefined ? undefined : materiais[prim.material]?.name) ?? "",
        posicoes,
        normais: glb.reais(atributo("NORMAL"), `${onde}.NORMAL`),
        uv: uvIndice === undefined ? null : glb.reais(uvIndice, `${onde}.TEXCOORD_0`),
        cores: coresDoVertice(glb, prim.attributes.COLOR_0, vertices, `${onde}.COLOR_0`),
        ossos: ossosDoVertice,
        pesos: normalizarPesos(pesos),
        indices: glb.inteiros(prim.indices, `${onde}.indices`),
        formas,
      };
    });
    malhas.push({ nome: no.name ?? `malha_${indiceDoNo}`, primitivas });
  });
  if (malhas.length === 0) throw new ErroDeArte(arquivo, "o corpo não tem malhas", "meshes");
  return { id, arquivo, armadura, ossos, inversas, malhas, altura: maxY - minY, chao: minY };
}

function coresDoVertice(
  glb: ArquivoGlb,
  indice: number | undefined,
  vertices: number,
  campo: string,
): Float32Array | null {
  if (indice === undefined) return null;
  const lido = glb.acessor(indice, campo);
  if (lido.quantidade !== vertices || lido.componentes < 3) {
    throw new ErroDeArte(glb.arquivo, "cores por vértice em número diferente dos vértices", campo);
  }
  let divisor = 1;
  if (!(lido.dados instanceof Float32Array)) {
    if (!lido.normalizado) throw new ErroDeArte(glb.arquivo, "cor inteira sem normalização", campo);
    divisor = lido.dados instanceof Uint8Array ? 255 : 65535;
  }
  const cores = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    for (let k = 0; k < 3; k++)
      cores[i * 3 + k] = em(lido.dados, i * lido.componentes + k) / divisor;
  }
  return cores;
}

export function malhaDoCorpo(corpo: Corpo, sufixo: string): MalhaDoCorpo | undefined {
  return corpo.malhas.find((m) => m.nome === `${corpo.id}_${sufixo}`);
}

export function indiceDoOsso(corpo: Corpo, nome: string): number {
  const indice = corpo.ossos.findIndex((o) => o.nome === nome);
  if (indice < 0)
    throw new ErroDeArte(corpo.arquivo, `o esqueleto não tem o osso ${nome}`, "skins.0.joints");
  return indice;
}
