import { closeSync, openSync, readSync, statSync } from "node:fs";
import { z } from "zod";
import { ErroDeArte, lerJson, validar } from "../erros";
import { item } from "../numeros";

/**
 * Leitor de GLB do tamanho do que a biblioteca usa: malhas com skin, formas e
 * animações, sem extensões nem compressão (é como o Blender exporta os corpos
 * e as bibliotecas). Lê o JSON inteiro e cada acessor só quando pedido, direto
 * do arquivo: uma biblioteca de 80 MB não entra toda na memória para tirar
 * dela meia dúzia de clipes.
 */

const numeros = z.array(z.number());

const tipoDeComponente = z.union([
  z.literal(5120),
  z.literal(5121),
  z.literal(5122),
  z.literal(5123),
  z.literal(5125),
  z.literal(5126),
]);

const EsparsoSchema = z.looseObject({
  count: z.number().int().nonnegative(),
  indices: z.looseObject({
    bufferView: z.number().int().nonnegative(),
    byteOffset: z.number().int().nonnegative().optional(),
    componentType: tipoDeComponente,
  }),
  values: z.looseObject({
    bufferView: z.number().int().nonnegative(),
    byteOffset: z.number().int().nonnegative().optional(),
  }),
});

const AcessorSchema = z.looseObject({
  /** Sem vista, o acessor começa em zeros (as formas esparsas do Blender). */
  bufferView: z.number().int().nonnegative().optional(),
  byteOffset: z.number().int().nonnegative().optional(),
  componentType: tipoDeComponente,
  normalized: z.boolean().optional(),
  count: z.number().int().nonnegative(),
  type: z.enum(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT4"]),
  min: numeros.optional(),
  max: numeros.optional(),
  sparse: EsparsoSchema.optional(),
});

const VistaSchema = z.looseObject({
  buffer: z.number().int().nonnegative(),
  byteOffset: z.number().int().nonnegative().optional(),
  byteLength: z.number().int().nonnegative(),
  byteStride: z.number().int().positive().optional(),
});

const atributos = z.record(z.string(), z.number().int().nonnegative());

const PrimitivaSchema = z.looseObject({
  attributes: atributos,
  indices: z.number().int().nonnegative().optional(),
  material: z.number().int().nonnegative().optional(),
  mode: z.number().int().optional(),
  targets: z.array(atributos).optional(),
});

const MalhaSchema = z.looseObject({
  name: z.string().optional(),
  primitives: z.array(PrimitivaSchema).min(1),
  weights: numeros.optional(),
  extras: z.looseObject({ targetNames: z.array(z.string()).optional() }).optional(),
});

const NoSchema = z.looseObject({
  name: z.string().optional(),
  mesh: z.number().int().nonnegative().optional(),
  skin: z.number().int().nonnegative().optional(),
  children: z.array(z.number().int().nonnegative()).optional(),
  translation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
  matrix: numeros.optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

const SkinSchema = z.looseObject({
  name: z.string().optional(),
  joints: z.array(z.number().int().nonnegative()).min(1),
  inverseBindMatrices: z.number().int().nonnegative().optional(),
  skeleton: z.number().int().nonnegative().optional(),
});

const CanalSchema = z.looseObject({
  sampler: z.number().int().nonnegative(),
  target: z.looseObject({
    node: z.number().int().nonnegative().optional(),
    path: z.enum(["translation", "rotation", "scale", "weights"]),
  }),
});

const AmostradorSchema = z.looseObject({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  interpolation: z.enum(["LINEAR", "STEP", "CUBICSPLINE"]).optional(),
});

const AnimacaoSchema = z.looseObject({
  name: z.string().optional(),
  channels: z.array(CanalSchema),
  samplers: z.array(AmostradorSchema),
});

export const GltfSchema = z.looseObject({
  asset: z.looseObject({ version: z.literal("2.0"), generator: z.string().optional() }),
  extensionsRequired: z.array(z.string()).optional(),
  scene: z.number().int().nonnegative().optional(),
  scenes: z.array(z.looseObject({ nodes: z.array(z.number().int().nonnegative()).optional() })),
  nodes: z.array(NoSchema),
  meshes: z.array(MalhaSchema).optional(),
  materials: z.array(z.looseObject({ name: z.string().optional() })).optional(),
  skins: z.array(SkinSchema).optional(),
  accessors: z.array(AcessorSchema).optional(),
  bufferViews: z.array(VistaSchema).optional(),
  buffers: z.array(z.looseObject({ byteLength: z.number().int().nonnegative() })).optional(),
  animations: z.array(AnimacaoSchema).optional(),
});

export type Gltf = z.infer<typeof GltfSchema>;
export type NoDoGltf = z.infer<typeof NoSchema>;
export type AnimacaoDoGltf = z.infer<typeof AnimacaoSchema>;

export type Numerico =
  | Float32Array
  | Uint32Array
  | Uint16Array
  | Uint8Array
  | Int16Array
  | Int8Array;

export type AcessorLido = {
  dados: Numerico;
  /** Quantos números por elemento (3 num `VEC3`). */
  componentes: number;
  quantidade: number;
  normalizado: boolean;
};

const MAGIA_GLTF = 0x46546c67;
const BLOCO_JSON = 0x4e4f534a;
const BLOCO_BIN = 0x004e4942;

const COMPONENTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as const;

function vetorDoTipo(tipo: number, bytes: Buffer): Numerico {
  // Cópia alinhada: o bloco pode começar em qualquer byte do arquivo.
  const copia = new ArrayBuffer(bytes.length);
  new Uint8Array(copia).set(bytes);
  switch (tipo) {
    case 5120:
      return new Int8Array(copia);
    case 5121:
      return new Uint8Array(copia);
    case 5122:
      return new Int16Array(copia);
    case 5123:
      return new Uint16Array(copia);
    case 5125:
      return new Uint32Array(copia);
    default:
      return new Float32Array(copia);
  }
}

const BYTES_DO_TIPO: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

export class ArquivoGlb {
  readonly arquivo: string;
  readonly json: Gltf;
  private readonly descritor: number;
  private readonly inicioDoBinario: number;
  private readonly tamanhoDoBinario: number;
  private aberto = true;

  constructor(caminho: string) {
    this.arquivo = caminho;
    const tamanho = statSync(caminho).size;
    this.descritor = openSync(caminho, "r");
    try {
      const cabecalho = this.ler(0, 20);
      if (tamanho < 20 || cabecalho.readUInt32LE(0) !== MAGIA_GLTF) {
        throw new ErroDeArte(caminho, "não é um GLB (falta a marca glTF)");
      }
      if (cabecalho.readUInt32LE(4) !== 2) {
        throw new ErroDeArte(caminho, `versão ${cabecalho.readUInt32LE(4)} de GLB não suportada`);
      }
      const tamanhoDoJson = cabecalho.readUInt32LE(12);
      if (cabecalho.readUInt32LE(16) !== BLOCO_JSON || 20 + tamanhoDoJson > tamanho) {
        throw new ErroDeArte(caminho, "o primeiro bloco do GLB não é o JSON");
      }
      const texto = this.ler(20, tamanhoDoJson).toString("utf8");
      this.json = validar(GltfSchema, lerJson(texto, caminho), caminho);
      const fimDoJson = 20 + tamanhoDoJson;
      if (fimDoJson + 8 <= tamanho) {
        const bloco = this.ler(fimDoJson, 8);
        if (bloco.readUInt32LE(4) !== BLOCO_BIN) {
          throw new ErroDeArte(caminho, "o segundo bloco do GLB não é o binário");
        }
        this.inicioDoBinario = fimDoJson + 8;
        this.tamanhoDoBinario = bloco.readUInt32LE(0);
      } else {
        this.inicioDoBinario = fimDoJson;
        this.tamanhoDoBinario = 0;
      }
      const exigidas = this.json.extensionsRequired ?? [];
      if (exigidas.length > 0) {
        throw new ErroDeArte(
          caminho,
          `usa extensões que este leitor não trata (${exigidas.join(", ")})`,
          "extensionsRequired",
        );
      }
    } catch (erro) {
      this.fechar();
      throw erro;
    }
  }

  fechar(): void {
    if (!this.aberto) return;
    this.aberto = false;
    closeSync(this.descritor);
  }

  private ler(posicao: number, bytes: number): Buffer {
    const destino = Buffer.alloc(bytes);
    let lidos = 0;
    while (lidos < bytes) {
      const n = readSync(this.descritor, destino, lidos, bytes - lidos, posicao + lidos);
      if (n <= 0) throw new ErroDeArte(this.arquivo, "o arquivo termina antes do esperado");
      lidos += n;
    }
    return destino;
  }

  acessor(indice: number, campo: string): AcessorLido {
    const acessor = this.json.accessors?.[indice];
    if (!acessor) throw new ErroDeArte(this.arquivo, `acessor ${indice} não existe`, campo);
    const componentes = COMPONENTES[acessor.type];
    const bytesDoTipo = BYTES_DO_TIPO[acessor.componentType] ?? 4;
    const elemento = componentes * bytesDoTipo;
    const dados =
      acessor.bufferView === undefined
        ? vetorDoTipo(acessor.componentType, Buffer.alloc(elemento * acessor.count))
        : vetorDoTipo(
            acessor.componentType,
            this.lerVista(
              acessor.bufferView,
              acessor.byteOffset ?? 0,
              elemento,
              acessor.count,
              campo,
            ),
          );
    if (acessor.sparse) {
      const { count, indices, values } = acessor.sparse;
      const bytesDoIndice = BYTES_DO_TIPO[indices.componentType] ?? 4;
      const quais = vetorDoTipo(
        indices.componentType,
        this.lerVista(
          indices.bufferView,
          indices.byteOffset ?? 0,
          bytesDoIndice,
          count,
          `${campo}.sparse.indices`,
        ),
      );
      const valores = vetorDoTipo(
        acessor.componentType,
        this.lerVista(
          values.bufferView,
          values.byteOffset ?? 0,
          elemento,
          count,
          `${campo}.sparse.values`,
        ),
      );
      for (let i = 0; i < count; i++) {
        const destino = quais[i] ?? -1;
        if (destino < 0 || destino >= acessor.count) {
          throw new ErroDeArte(
            this.arquivo,
            "índice esparso fora do acessor",
            `${campo}.sparse.indices`,
          );
        }
        for (let k = 0; k < componentes; k++) {
          dados[destino * componentes + k] = valores[i * componentes + k] ?? 0;
        }
      }
    }
    return {
      dados,
      componentes,
      quantidade: acessor.count,
      normalizado: acessor.normalized === true,
    };
  }

  /** Os bytes de `quantidade` elementos de uma vista, já sem o espaçamento entre eles. */
  private lerVista(
    indice: number,
    deslocamento: number,
    elemento: number,
    quantidade: number,
    campo: string,
  ): Buffer {
    const vista = this.json.bufferViews?.[indice];
    if (!vista) throw new ErroDeArte(this.arquivo, `bufferView ${indice} não existe`, campo);
    if (vista.buffer !== 0) {
      throw new ErroDeArte(this.arquivo, "só o buffer embutido do GLB é suportado", campo);
    }
    const passo = vista.byteStride ?? elemento;
    const inicio = (vista.byteOffset ?? 0) + deslocamento;
    const total = quantidade === 0 ? 0 : passo * (quantidade - 1) + elemento;
    if (inicio + total > this.tamanhoDoBinario) {
      throw new ErroDeArte(this.arquivo, "o acessor passa do fim do binário", campo);
    }
    const bruto = this.ler(this.inicioDoBinario + inicio, total);
    if (passo === elemento) return bruto;
    const compacto = Buffer.alloc(elemento * quantidade);
    for (let i = 0; i < quantidade; i++) {
      bruto.copy(compacto, i * elemento, i * passo, i * passo + elemento);
    }
    return compacto;
  }

  /** Acessor de ponto flutuante, sem normalização: posições, normais, UV, pesos, matrizes, chaves. */
  reais(indice: number, campo: string): Float32Array {
    const lido = this.acessor(indice, campo);
    if (!(lido.dados instanceof Float32Array)) {
      throw new ErroDeArte(this.arquivo, "esperava números de ponto flutuante de 32 bits", campo);
    }
    return lido.dados;
  }

  /** Acessor de inteiros sem sinal (índices e ossos), sempre devolvido em 32 bits. */
  inteiros(indice: number, campo: string): Uint32Array {
    const lido = this.acessor(indice, campo);
    if (lido.dados instanceof Float32Array || lido.normalizado) {
      throw new ErroDeArte(this.arquivo, "esperava inteiros", campo);
    }
    return Uint32Array.from(lido.dados);
  }

  no(indice: number): NoDoGltf {
    return item(this.json.nodes, indice);
  }
}
