import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { ErroDeArte, lerJson, validar } from "../erros";

/**
 * Peças e cabelos em arquivo próprio (`biblioteca/itens/<id>.txt`), no formato
 * `MIT1` descrito em `biblioteca/LEIA_roupas.md`: gzip + base64 de `"MIT1"`,
 * u32 com o tamanho do cabeçalho, o cabeçalho em JSON e os blocos binários.
 */

const inteiro = z.number().int().nonnegative();
const grupo = z.tuple([inteiro, inteiro, z.string()]);
const TIPOS_DE_BLOCO = ["uint8", "uint16", "int16", "uint32", "float32"] as const;

export const CabecalhoDoItemSchema = z.strictObject({
  id: z.string().min(1),
  /** Famílias de malha-base em que a peça foi encaixada (m, f, p). */
  familias: z.record(z.string(), z.boolean()),
  tipo: z.enum(["pele", "cabeca", "mao"]),
  uv: z.boolean(),
  nv: inteiro,
  ni: inteiro,
  /** Faixas do índice por material: [início, quantidade, material]. */
  grupos: z.array(grupo).min(1),
  /** Famílias em que a geometria sai em outra ordem trazem os próprios números. */
  proprios: z
    .record(z.string(), z.strictObject({ nv: inteiro, ni: inteiro, grupos: z.array(grupo).min(1) }))
    .optional(),
  /** Ossos dos pesos próprios da peça (`<fam>_osso` aponta para esta lista). */
  ossos: z.array(z.string()).optional(),
  /** Peça com parte de saia: a pele das pernas some de mais longe e os pesos trocam com a pose. */
  solta: z.boolean().optional(),
  saia_fechada: z.boolean().optional(),
  mao: z.enum(["dir", "esq"]).optional(),
  /** Nome do bloco → [deslocamento depois do cabeçalho, bytes, tipo]. */
  blocos: z.record(z.string(), z.tuple([inteiro, inteiro, z.enum(TIPOS_DE_BLOCO)])),
});

export type CabecalhoDoItem = z.infer<typeof CabecalhoDoItemSchema>;
export type BlocoDoItem = Uint8Array | Uint16Array | Int16Array | Uint32Array | Float32Array;

export type Item = {
  arquivo: string;
  cabecalho: CabecalhoDoItem;
  blocos: Map<string, BlocoDoItem>;
};

const BYTES: Record<(typeof TIPOS_DE_BLOCO)[number], number> = {
  uint8: 1,
  uint16: 2,
  int16: 2,
  uint32: 4,
  float32: 4,
};

/** Abre o envelope dos arquivos de texto da biblioteca: base64 de um gzip. */
export function abrirGzBase64(texto: string, arquivo: string): Buffer {
  const limpo = texto.trim();
  if (limpo.length === 0 || !/^[A-Za-z0-9+/=\s]+$/.test(limpo)) {
    throw new ErroDeArte(arquivo, "o conteúdo não é base64");
  }
  try {
    return gunzipSync(Buffer.from(limpo, "base64"));
  } catch (erro) {
    throw new ErroDeArte(
      arquivo,
      `o gzip não abre: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

export function decodificarItem(bytes: Buffer, arquivo: string): Item {
  if (bytes.length < 8 || bytes.subarray(0, 4).toString("latin1") !== "MIT1") {
    throw new ErroDeArte(arquivo, 'não começa com a marca "MIT1"');
  }
  const tamanhoDoCabecalho = bytes.readUInt32LE(4);
  const inicio = 8 + tamanhoDoCabecalho;
  if (inicio > bytes.length) {
    throw new ErroDeArte(arquivo, "o cabeçalho passa do fim do arquivo");
  }
  const cabecalho = validar(
    CabecalhoDoItemSchema,
    lerJson(bytes.subarray(8, inicio).toString("utf8"), arquivo),
    arquivo,
  );
  const blocos = new Map<string, BlocoDoItem>();
  for (const [nome, [deslocamento, tamanho, tipo]] of Object.entries(cabecalho.blocos)) {
    const campo = `blocos.${nome}`;
    if (inicio + deslocamento + tamanho > bytes.length) {
      throw new ErroDeArte(arquivo, "o bloco passa do fim do arquivo", campo);
    }
    if (tamanho % BYTES[tipo] !== 0) {
      throw new ErroDeArte(arquivo, `${tamanho} bytes não fecham em ${tipo}`, campo);
    }
    // Cópia alinhada: os blocos começam em qualquer byte.
    const copia = new ArrayBuffer(tamanho);
    new Uint8Array(copia).set(
      bytes.subarray(inicio + deslocamento, inicio + deslocamento + tamanho),
    );
    blocos.set(nome, vetorDoBloco(tipo, copia));
  }
  const item: Item = { arquivo, cabecalho, blocos };
  conferirBlocos(item);
  return item;
}

function vetorDoBloco(tipo: (typeof TIPOS_DE_BLOCO)[number], copia: ArrayBuffer): BlocoDoItem {
  switch (tipo) {
    case "uint8":
      return new Uint8Array(copia);
    case "uint16":
      return new Uint16Array(copia);
    case "int16":
      return new Int16Array(copia);
    case "uint32":
      return new Uint32Array(copia);
    default:
      return new Float32Array(copia);
  }
}

export type GeometriaDaFamilia = {
  nv: number;
  grupos: CabecalhoDoItem["grupos"];
  uv: BlocoDoItem;
  indices: BlocoDoItem;
};

/** Vértices, grupos, UV e índice da peça numa família, que pode ter os próprios (`proprios`). */
export function geometriaDaFamilia(item: Item, familia: string): GeometriaDaFamilia {
  const { cabecalho, blocos, arquivo } = item;
  const proprio = cabecalho.proprios?.[familia];
  const uv = blocos.get(`${familia}_uv`) ?? blocos.get("uv");
  const indices = blocos.get(`${familia}_idx`) ?? blocos.get("idx");
  if (!uv) throw new ErroDeArte(arquivo, "falta o bloco de UV", "blocos.uv");
  if (!indices) throw new ErroDeArte(arquivo, "falta o bloco de índices", "blocos.idx");
  return {
    nv: proprio ? proprio.nv : cabecalho.nv,
    grupos: proprio ? proprio.grupos : cabecalho.grupos,
    uv,
    indices,
  };
}

export function blocoDoItem<T extends BlocoDoItem>(
  item: Item,
  nome: string,
  tipo: new (...args: never[]) => T,
): T {
  const bloco = item.blocos.get(nome);
  if (!bloco) throw new ErroDeArte(item.arquivo, "falta o bloco", `blocos.${nome}`);
  if (!(bloco instanceof tipo)) {
    throw new ErroDeArte(item.arquivo, `o bloco não é ${tipo.name}`, `blocos.${nome}`);
  }
  return bloco;
}

function conferirBlocos(item: Item): void {
  const { cabecalho, blocos, arquivo } = item;
  const exigir = (nome: string, quantidade: number) => {
    const bloco = blocos.get(nome);
    if (!bloco) throw new ErroDeArte(arquivo, "falta o bloco", `blocos.${nome}`);
    if (bloco.length !== quantidade) {
      throw new ErroDeArte(
        arquivo,
        `tem ${bloco.length} números, esperava ${quantidade}`,
        `blocos.${nome}`,
      );
    }
  };
  for (const [familia, presente] of Object.entries(cabecalho.familias)) {
    if (!presente) continue;
    const geometria = geometriaDaFamilia(item, familia);
    const { nv } = geometria;
    if (geometria.uv.length !== nv * 2) {
      throw new ErroDeArte(
        arquivo,
        `UV com ${geometria.uv.length} números para ${nv} vértices`,
        "blocos.uv",
      );
    }
    const fim = geometria.grupos.reduce((maior, [ini, n]) => Math.max(maior, ini + n), 0);
    if (fim !== geometria.indices.length || fim % 3 !== 0) {
      throw new ErroDeArte(arquivo, "os grupos não fecham com o índice", "grupos");
    }
    for (const indice of geometria.indices) {
      if (indice >= nv)
        throw new ErroDeArte(arquivo, `índice ${indice} fora dos ${nv} vértices`, "blocos.idx");
    }
    if (cabecalho.tipo === "pele") {
      exigir(`${familia}_tri`, nv);
      exigir(`${familia}_bar`, nv * 2);
      exigir(`${familia}_off`, nv * 3);
      if (blocos.has(`${familia}_osso`) || blocos.has(`${familia}_peso`)) {
        exigir(`${familia}_osso`, nv * 4);
        exigir(`${familia}_peso`, nv * 4);
        if (!cabecalho.ossos)
          throw new ErroDeArte(arquivo, "pesos próprios sem a lista de ossos", "ossos");
      }
    } else if (cabecalho.tipo === "cabeca") {
      exigir(`${familia}_pos`, nv * 3);
    } else {
      exigir("loc", nv * 3);
    }
  }
}

export function lerItem(caminho: string): Item {
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch {
    throw new ErroDeArte(caminho, "arquivo não encontrado");
  }
  return decodificarItem(abrirGzBase64(texto, caminho), caminho);
}
