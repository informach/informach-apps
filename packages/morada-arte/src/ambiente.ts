import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { type Document, type Node, Scene } from "@gltf-transform/core";
import { getBounds, quantize, reorder, unpartition } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { z } from "zod";
import { ErroDeArte, lerJson, validar } from "./erros";
import type { AberturaDoManifesto, AcabamentoDoManifesto, ObjetoDoManifesto } from "./manifesto";
import { entradaESaida } from "./saida/glb";

const id = z.string().regex(/^[a-z0-9_-]+$/);
const numero = z.number().finite();
const vetor = z.tuple([numero, numero, numero]);
const CasaSchema = z.looseObject({
  objetos: z.array(z.looseObject({ catalogo: id, versao: z.number().int().positive() })),
  andares: z.array(
    z.looseObject({
      comodos: z.array(z.looseObject({ piso: id, parede: id })),
      aberturas: z.array(
        z.looseObject({
          tipo: z.enum(["porta", "janela"]),
          largura: numero.positive(),
          altura: numero.positive(),
          peitoril: numero.nonnegative(),
        }),
      ),
    }),
  ),
});
const ItemSchema = z.looseObject({
  id,
  arquivo: z.string(),
  grupo: z.string().default(""),
});
const CatalogoSchema = z.looseObject({ itens: z.array(ItemSchema) });
const VaoSchema = z.looseObject({
  larg: numero.positive(),
  alt: numero.positive(),
  peitoril: numero,
});
const ConstrucaoSchema = z.looseObject({
  paredes: z.array(z.looseObject({ id, vaos: z.array(VaoSchema).optional() })),
  escala_textura: z.strictObject({ piso: numero.positive(), parede: numero.positive() }),
});
const EncaixeSchema = z.looseObject({
  id,
  arquivo: z.string(),
  cor: z.string(),
  vao: z.looseObject({ peca: id, indice: z.number().int().nonnegative() }),
  batente: id.optional(),
});
const EncaixesSchema = z.looseObject({
  portas: z.array(EncaixeSchema),
  janelas: z.array(EncaixeSchema),
  batentes: z.array(z.looseObject({ id, arquivo: z.string() })),
});

function json<T>(pasta: string, nome: string, schema: z.ZodType<T>): T {
  const caminho = caminhoInterno(pasta, nome);
  return validar(schema, lerJson(readFileSync(caminho, "utf8"), caminho), caminho);
}

/** Não segue links nem referências de catálogo para fora da biblioteca privada. */
export function caminhoInterno(pasta: string, nome: string): string {
  const raiz = realpathSync(pasta);
  const destino = realpathSync(resolve(raiz, nome));
  const rel = relative(raiz, destino);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  ) {
    throw new ErroDeArte(nome, "o arquivo precisa ficar dentro da pasta de entrada");
  }
  return destino;
}

function gravar(saida: string, prefixo: string, bytes: Uint8Array, extensao = "glb"): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const nome = `${prefixo}.${hash}.${extensao}`;
  writeFileSync(join(saida, nome), bytes);
  return nome;
}

/** Lê somente GLB autocontido: um pacote nunca dispara downloads externos no jogo. */
async function lerModelo(pasta: string, nome: string): Promise<Document> {
  const caminho = caminhoInterno(pasta, nome);
  const bytes = readFileSync(caminho);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new ErroDeArte(caminho, "esperava um GLB 2.0");
  }
  const tamanho = bytes.readUInt32LE(12);
  const cabecalho = validar(
    z.looseObject({
      images: z.array(z.looseObject({ uri: z.string().optional() })).optional(),
      buffers: z.array(z.looseObject({ uri: z.string().optional() })).optional(),
    }),
    lerJson(bytes.subarray(20, 20 + tamanho).toString("utf8"), caminho),
    caminho,
  );
  if (
    [...(cabecalho.images ?? []), ...(cabecalho.buffers ?? [])].some((x) => x.uri !== undefined)
  ) {
    throw new ErroDeArte(caminho, "o GLB deve ter texturas e buffers embutidos, sem URI externa");
  }
  return (await entradaESaida()).readBinary(bytes);
}

function desenho(doc: Document): ObjetoDoManifesto["desenho"] {
  let chamadas = 0;
  let triangulos = 0;
  let vertices = 0;
  for (const no of doc.getRoot().listNodes()) {
    for (const prim of no.getMesh()?.listPrimitives() ?? []) {
      chamadas++;
      const total = prim.getAttribute("POSITION")?.getCount() ?? 0;
      vertices += total;
      triangulos += (prim.getIndices()?.getCount() ?? total) / 3;
    }
  }
  return { chamadas, triangulos, vertices, texturas: doc.getRoot().listTextures().length };
}

function pontoNoMundo(no: Node, p: number[]): [number, number, number] {
  const m = no.getWorldMatrix();
  const [x = 0, y = 0, z = 0] = p;
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ];
}

/** Raio vertical sobre uma superfície de uso; não confunde cabeceira com colchão. */
export function medirApoio(doc: Document, de: number, ate: number, x = 0, z = 0): number {
  let altura: number | null = null;
  for (const no of doc.getRoot().listNodes()) {
    for (const prim of no.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const indices = prim.getIndices();
      const n = indices?.getCount() ?? pos.getCount();
      for (let i = 0; i < n; i += 3) {
        const pontos = [0, 1, 2].map((k) =>
          pontoNoMundo(no, pos.getElement(indices?.getScalar(i + k) ?? i + k, [])),
        );
        const a = pontos[0];
        const b = pontos[1];
        const c = pontos[2];
        if (!a || !b || !c) continue;
        const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
        if (Math.abs(det) < 1e-10) continue;
        const u = ((x - a[0]) * (c[2] - a[2]) - (z - a[2]) * (c[0] - a[0])) / det;
        const v = ((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])) / det;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const y = a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
        if (y >= de && y <= ate && (altura === null || y > altura)) altura = y;
      }
    }
  }
  if (altura === null) throw new ErroDeArte("apoio", `nenhuma superfície entre ${de} e ${ate} m`);
  return Math.round(altura * 1000) / 1000;
}

function apoios(doc: Document, grupo: string): Record<string, number> {
  if (/beliche/.test(grupo))
    return { deitar_1: medirApoio(doc, 0.25, 0.7), deitar_2: medirApoio(doc, 1, 1.5) };
  if (/berco/.test(grupo)) {
    const altura = medirApoio(doc, 0.2, 0.7);
    return { cuidar: altura, dentro: altura };
  }
  if (/casal|solteiro/.test(grupo)) {
    const altura = medirApoio(doc, 0.25, 0.7);
    return { deitar_1: altura, deitar_2: altura };
  }
  if (/sofa/.test(grupo)) {
    // A almofada do encosto pode passar sobre o centro do móvel. Mede a
    // metade dianteira do assento, onde o quadril realmente se apoia.
    const altura = medirApoio(doc, 0.25, 0.6, 0, 0.2);
    return { sentar_1: altura, sentar_2: altura, sentar_3: altura };
  }
  if (/vaso/.test(grupo)) return { sentar: medirApoio(doc, 0.3, 0.5) };
  return {};
}

async function comprimir(doc: Document): Promise<Uint8Array> {
  await doc.transform(
    unpartition(),
    quantize({ quantizePosition: 14, quantizeTexcoord: 12 }),
    reorder({ encoder: MeshoptEncoder }),
  );
  const { EXTMeshoptCompression } = await import("@gltf-transform/extensions");
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return (await entradaESaida()).writeBinary(doc);
}

export type AmbienteEmpacotado = {
  objetos: ObjetoDoManifesto[];
  acabamentos: AcabamentoDoManifesto[];
  aberturas: AberturaDoManifesto[];
};

/** A seleção vem da planta, nunca de uma segunda lista dos móveis da prova. */
export async function empacotarAmbiente(
  arte: string,
  saida: string,
  casa: unknown,
): Promise<AmbienteEmpacotado> {
  const modelo = validar(CasaSchema, casa, "casa");
  const resultado: AmbienteEmpacotado = { objetos: [], acabamentos: [], aberturas: [] };
  const raiz = join(arte, "biblioteca/moveis");
  const catalogo = new Map<string, { pasta: string; entrada: z.infer<typeof ItemSchema> }>();
  for (const categoria of readdirSync(raiz, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const pasta = join(raiz, categoria.name);
    if (!existsSync(join(pasta, "catalogo.json"))) continue;
    for (const entrada of json(pasta, "catalogo.json", CatalogoSchema).itens) {
      if (catalogo.has(entrada.id)) throw new ErroDeArte(raiz, `id repetido: ${entrada.id}`);
      catalogo.set(entrada.id, { pasta, entrada });
    }
  }
  const pedidos = new Map(modelo.objetos.map((x) => [`${x.catalogo}@${x.versao}`, x]));
  for (const [, pedido] of [...pedidos].sort(([a], [b]) => a.localeCompare(b))) {
    const item = catalogo.get(pedido.catalogo);
    if (!item) throw new ErroDeArte(raiz, `não há modelo para ${pedido.catalogo}`);
    const doc = await lerModelo(item.pasta, item.entrada.arquivo);
    const cena = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    if (!cena) throw new ErroDeArte(item.entrada.arquivo, "não tem cena");
    const { min, max } = getBounds(cena);
    const limites = validar(z.tuple([vetor, vetor]), [min, max], item.entrada.arquivo);
    const apoio = apoios(doc, item.entrada.grupo);
    const custo = desenho(doc);
    const bytes = await comprimir(doc);
    resultado.objetos.push({
      id: pedido.catalogo,
      versao: pedido.versao,
      arquivo: gravar(saida, `obj-${pedido.catalogo}`, bytes),
      bytes: bytes.length,
      limites,
      apoios: apoio,
      desenho: custo,
    });
  }
  const pasta = join(arte, "biblioteca/construcao");
  const construcao = json(pasta, "construcao.json", ConstrucaoSchema);
  const texturas = new Map<string, number>();
  for (const andar of modelo.andares)
    for (const comodo of andar.comodos) {
      texturas.set(comodo.piso, construcao.escala_textura.piso);
      texturas.set(comodo.parede, construcao.escala_textura.parede);
    }
  for (const [id, escala] of [...texturas].sort(([a], [b]) => a.localeCompare(b))) {
    const bytes = readFileSync(caminhoInterno(pasta, `texturas/${id}.png`));
    resultado.acabamentos.push({
      id,
      escala,
      arquivo: gravar(saida, `tex-${id}`, bytes, "png"),
      bytes: bytes.length,
    });
  }
  const encaixes = json(pasta, "portas_janelas.json", EncaixesSchema);
  const formas = new Set<string>();
  for (const andar of modelo.andares)
    for (const abertura of andar.aberturas) {
      const { tipo } = abertura;
      const largura = abertura.largura / 1000,
        altura = abertura.altura / 1000,
        peitoril = abertura.peitoril / 1000;
      const chave = `${tipo}:${largura}:${altura}:${peitoril}`;
      if (formas.has(chave)) continue;
      formas.add(chave);
      // Os vãos de passagem de 1,2 × 2,3 m ficam abertos, como na planta da prova.
      if (tipo === "porta" && largura === 1.2 && altura === 2.3) continue;
      const peca = (tipo === "porta" ? encaixes.portas : encaixes.janelas).find((x) => {
        const vao = construcao.paredes.find((p) => p.id === x.vao.peca)?.vaos?.[x.vao.indice];
        return (
          x.cor === "branca" &&
          vao &&
          vao.larg === largura &&
          vao.alt === altura &&
          vao.peitoril === peitoril
        );
      });
      if (!peca) throw new ErroDeArte(pasta, `não há encaixe para ${chave}`);
      const doc = await lerModelo(pasta, peca.arquivo);
      if (peca.batente) {
        const batente = encaixes.batentes.find((x) => x.id === peca.batente);
        if (!batente) throw new ErroDeArte(pasta, `falta o batente ${peca.batente}`);
        const { mergeDocuments } = await import("@gltf-transform/functions");
        const outro = await lerModelo(pasta, batente.arquivo);
        const cena = doc.getRoot().listScenes()[0];
        const copia = mergeDocuments(doc, outro);
        for (const cenaOriginal of outro.getRoot().listScenes()) {
          const importada = copia.get(cenaOriginal);
          if (importada instanceof Scene && cena) {
            for (const no of importada.listChildren()) cena.addChild(no);
            importada.dispose();
          }
        }
      }
      const custo = desenho(doc);
      const bytes = await comprimir(doc);
      resultado.aberturas.push({
        id: peca.id,
        tipo,
        largura,
        altura,
        peitoril,
        desenho: custo,
        arquivo: gravar(saida, `vao-${peca.id}`, bytes),
        bytes: bytes.length,
      });
    }
  return resultado;
}
