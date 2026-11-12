import { readFileSync } from "node:fs";
import { z } from "zod";
import { ErroDeArte, lerJson, validar } from "../erros";

/**
 * Os catálogos da biblioteca: roupas, cabelos, máscaras de cor livre, elenco,
 * apoios das animações e rótulos dos clipes. Só os campos que o empacotador usa
 * são conferidos; o resto de cada item passa sem ser olhado.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// ------------------------------------------------------------------ roupas

const ItemDeRoupaSchema = z.looseObject({
  id: z.string().min(1),
  rotulo: z.string(),
  /** Variação: herda o que não disser da peça de base. */
  base: z.string().optional(),
  slot: z.string().optional(),
  tipo: z.enum(["pele", "cabeca", "rosto", "mao"]).optional(),
  /** Chapéu que fica por cima do cabelo (`false`): não troca o penteado nem corta o cabelo. */
  achata: z.boolean().optional(),
  /** Peça inteira que só esconde estas partes (a jardineira esconde só a de baixo). */
  cobre: z.array(z.string()).optional(),
  /** Trama com furos: a pele embaixo não some. */
  transparente: z.boolean().optional(),
  variacao: z.looseObject({ cor: hex.optional() }).optional(),
  gerar: z
    .looseObject({
      tipo: z.string().optional(),
      copa: z
        .looseObject({ corte: z.number().optional(), inclina: z.number().optional() })
        .optional(),
    })
    .optional(),
});

export const CatalogoDeRoupasSchema = z.looseObject({
  slots: z.record(z.string(), z.string()),
  itens: z.array(ItemDeRoupaSchema),
});

export type ItemDeRoupa = z.infer<typeof ItemDeRoupaSchema> & { slot: string; tipo: string };

export type CatalogoDeRoupas = {
  slots: Record<string, string>;
  itens: Map<string, ItemDeRoupa>;
};

/** Herança das variações, como a página faz: os campos da base, depois os da própria peça. */
function resolverBases<T extends { id: string; base?: string | undefined }>(
  itens: readonly T[],
  arquivo: string,
): T[] {
  const porId = new Map(itens.map((x) => [x.id, x] as const));
  const resolver = (x: T, vistos: readonly string[]): T => {
    if (!x.base) return x;
    if (vistos.includes(x.id)) throw new ErroDeArte(arquivo, `base em círculo em ${x.id}`, "itens");
    const base = porId.get(x.base);
    if (!base)
      throw new ErroDeArte(
        arquivo,
        `${x.id} aponta para a base ${x.base}, que não existe`,
        "itens",
      );
    return { ...resolver(base, [...vistos, x.id]), ...x };
  };
  return itens.map((x) => resolver(x, []));
}

export function decodificarRoupas(dado: unknown, arquivo: string): CatalogoDeRoupas {
  const lido = validar(CatalogoDeRoupasSchema, dado, arquivo);
  const itens = new Map<string, ItemDeRoupa>();
  for (const it of resolverBases(lido.itens, arquivo)) {
    if (!it.slot || !it.tipo)
      throw new ErroDeArte(arquivo, `${it.id} sem slot ou sem tipo`, "itens");
    if (!(it.slot in lido.slots)) {
      throw new ErroDeArte(
        arquivo,
        `${it.id} usa o slot ${it.slot}, que não está em slots`,
        "itens",
      );
    }
    itens.set(it.id, { ...it, slot: it.slot, tipo: it.tipo });
  }
  return { slots: lido.slots, itens };
}

// ------------------------------------------------------------------ cabelos

const ItemDeCabeloSchema = z.looseObject({
  id: z.string().min(1),
  rotulo: z.string(),
  base: z.string().optional(),
  tipo: z.enum(["cabelo", "rosto"]).optional(),
  /** Grupo de corpos (ou um corpo) que pode usar o item. */
  so: z.string().optional(),
});

export const CatalogoDeCabelosSchema = z.looseObject({
  grupos: z.record(z.string(), z.array(z.string())),
  /** Penteado original de cada base de corpo (m, f, fm, p). */
  originais: z.record(z.string(), z.string()),
  itens: z.array(ItemDeCabeloSchema),
});

export type ItemDeCabelo = z.infer<typeof ItemDeCabeloSchema> & { tipo: "cabelo" | "rosto" };

export type CatalogoDeCabelos = {
  grupos: Record<string, string[]>;
  originais: Record<string, string>;
  itens: Map<string, ItemDeCabelo>;
};

export function decodificarCabelos(dado: unknown, arquivo: string): CatalogoDeCabelos {
  const lido = validar(CatalogoDeCabelosSchema, dado, arquivo);
  const itens = new Map<string, ItemDeCabelo>();
  for (const it of resolverBases(lido.itens, arquivo)) {
    if (!it.tipo) throw new ErroDeArte(arquivo, `${it.id} sem tipo`, "itens");
    itens.set(it.id, { ...it, tipo: it.tipo });
  }
  return { grupos: lido.grupos, originais: lido.originais, itens };
}

// ------------------------------------------------------------------ máscaras de cor livre

export const MascarasSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.strictObject({
      /** Arquivo da máscara em `roupas_mascaras/`. */
      mascara: z.string().min(1),
      /** Luminância linear da cor principal da peça na textura. */
      lum: z.number(),
      /** A cor principal da peça na textura, `#rrggbb`; a página não usa. */
      cor: z.string().optional(),
    }),
  ),
);

export type Mascaras = z.infer<typeof MascarasSchema>;

// ------------------------------------------------------------------ elenco

const PecaDoElencoSchema = z.strictObject({ id: z.string().min(1), cor: hex.nullable() });

export const PersonagemDoElencoSchema = z.looseObject({
  id: z.string().min(1),
  nome: z.string().min(1),
  grupo: z.string(),
  faixa: z.string(),
  corpo: z.string().min(1),
  /** Nome de um tom pronto (Clara, Média, Morena, Escura) ou uma cor. */
  pele: z.string().min(1),
  expressao: z.string(),
  cabelo: z.union([
    z.strictObject({ penteado: z.string(), cor: z.string(), barba: z.string() }),
    // recém-nascido
    z.strictObject({ tipo: z.enum(["careca", "baixinho", "gorro"]), cor: z.string() }),
  ]),
  roupa: z.record(z.string(), PecaDoElencoSchema).optional(),
  objetos: z
    .strictObject({ dir: PecaDoElencoSchema.optional(), esq: PecaDoElencoSchema.optional() })
    .optional(),
  gravidez: z.number().int().min(0).max(3).optional(),
  manta: z.string().optional(),
  chupeta: z.boolean().optional(),
  animacao: z.string().nullable(),
});

export const ElencoSchema = z.looseObject({
  grupos: z.record(z.string(), z.string()),
  personagens: z.array(PersonagemDoElencoSchema),
});

export type PersonagemDoElenco = z.infer<typeof PersonagemDoElencoSchema>;

// ------------------------------------------------------------------ apoios e rótulos das animações

export const InfoSchema = z.looseObject({
  /** `apoios[esqueleto][clipe]`: o que o clipe espera na cena, em metros, coordenadas do Blender. */
  apoios: z.record(z.string(), z.record(z.string(), z.looseObject({ tipo: z.string() }))),
  correcoes: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export type Info = z.infer<typeof InfoSchema>;

export const RotulosSchema = z.looseObject({
  categorias: z.array(z.string()),
  /** id do clipe → [categoria, nome]. */
  rotulos: z.record(z.string(), z.tuple([z.string(), z.string()])),
  compostas: z.record(z.string(), z.string()),
});

export type Rotulos = z.infer<typeof RotulosSchema>;

// ------------------------------------------------------------------ leitura

export function lerArquivoJson<T>(caminho: string, esquema: z.ZodType<T>): T {
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch {
    throw new ErroDeArte(caminho, "arquivo não encontrado");
  }
  return validar(esquema, lerJson(texto, caminho), caminho);
}

export function lerRoupas(caminho: string): CatalogoDeRoupas {
  return decodificarRoupas(lerArquivoJson(caminho, z.unknown()), caminho);
}

export function lerCabelos(caminho: string): CatalogoDeCabelos {
  return decodificarCabelos(lerArquivoJson(caminho, z.unknown()), caminho);
}
