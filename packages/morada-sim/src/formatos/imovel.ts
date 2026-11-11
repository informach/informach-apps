import { z } from "zod";

/**
 * A casa é um documento: paredes, aberturas, cômodos e, à parte, os objetos.
 * O mundo salvo nunca guarda arquivo 3D; cada objeto aponta para o catálogo
 * com versão, posição e variação de cor, e o navegador monta a casa.
 *
 * Unidades: milímetros inteiros, planta em x e y, altura em z. Giro em graus.
 */

const mm = z.number().int();
const ponto = z.tuple([mm, mm]);
const retangulo = z.tuple([mm, mm, mm, mm]);

export const ParedeSchema = z.strictObject({
  id: z.string().min(1),
  a: ponto,
  b: ponto,
});
export type Parede = z.infer<typeof ParedeSchema>;

export const AberturaSchema = z.strictObject({
  id: z.string().min(1),
  parede: z.string().min(1),
  /** Centro da abertura, sobre a parede. */
  centro: ponto,
  largura: mm.positive(),
  peitoril: mm.nonnegative(),
  altura: mm.positive(),
  tipo: z.enum(["porta", "janela"]),
  externa: z.boolean(),
});
export type Abertura = z.infer<typeof AberturaSchema>;

export const ComodoSchema = z.strictObject({
  nome: z.string().min(1),
  tipo: z.string().min(1),
  /** `[x0, y0, x1, y1]` de cada retângulo do cômodo. */
  ret: z.array(retangulo).min(1),
  /** Acabamentos, como ids do catálogo de texturas. */
  parede: z.string(),
  piso: z.string(),
});
export type Comodo = z.infer<typeof ComodoSchema>;

export const AndarSchema = z.strictObject({
  n: z.number().int().nonnegative(),
  /** Altura do piso deste andar. */
  z: mm,
  contorno: z.array(ponto).min(3),
  paredes: z.array(ParedeSchema),
  aberturas: z.array(AberturaSchema),
  comodos: z.array(ComodoSchema),
});
export type Andar = z.infer<typeof AndarSchema>;

export const ObjetoDoModeloSchema = z.strictObject({
  catalogo: z.string().min(1),
  versao: z.number().int().positive(),
  pos: z.tuple([mm, mm, mm]),
  andar: z.number().int().nonnegative(),
  giro: z.number().int(),
  cor: z.number().int().nonnegative(),
});
export type ObjetoDoModelo = z.infer<typeof ObjetoDoModeloSchema>;

/**
 * Modelo de imóvel: uma casa pronta, no referencial dela mesma. Ao criar um
 * mundo, o modelo é copiado para um lote e deixa de ser consultado.
 */
export const ModeloDeImovelSchema = z.strictObject({
  formato: z.literal("morada.modelo-de-imovel"),
  versao: z.literal(1),
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string(),
  fundacao: mm.nonnegative(),
  andares: z.array(AndarSchema).min(1),
  objetos: z.array(ObjetoDoModeloSchema),
});
export type ModeloDeImovel = z.infer<typeof ModeloDeImovelSchema>;

/** O imóvel dentro de um mundo, já em coordenadas do lote. Os objetos ficam na tabela de objetos. */
export const DocumentoDeImovelSchema = z.strictObject({
  formato: z.literal("morada.imovel"),
  versao: z.literal(1),
  id: z.string().min(1),
  /** De que modelo veio, como `id@versao`; `null` em casa construída do zero. */
  modelo: z.string().nullable(),
  /** Sobe a cada mudança de planta. A navegação é refeita quando muda. */
  revisao: z.number().int().positive(),
  fundacao: mm.nonnegative(),
  andares: z.array(AndarSchema).min(1),
});
export type DocumentoDeImovel = z.infer<typeof DocumentoDeImovelSchema>;

function deslocar(p: readonly [number, number], dx: number, dy: number): [number, number] {
  return [p[0] + dx, p[1] + dy];
}

/** Leva os andares de um modelo para o referencial do lote. */
export function andaresNoLote(modelo: ModeloDeImovel, posicao: readonly [number, number]): Andar[] {
  const [dx, dy] = posicao;
  return modelo.andares.map((andar) => ({
    n: andar.n,
    z: andar.z,
    contorno: andar.contorno.map((p) => deslocar(p, dx, dy)),
    paredes: andar.paredes.map((parede) => ({
      id: parede.id,
      a: deslocar(parede.a, dx, dy),
      b: deslocar(parede.b, dx, dy),
    })),
    aberturas: andar.aberturas.map((abertura) => ({
      ...abertura,
      centro: deslocar(abertura.centro, dx, dy),
    })),
    comodos: andar.comodos.map((comodo) => ({
      ...comodo,
      ret: comodo.ret.map(([x0, y0, x1, y1]): [number, number, number, number] => [
        x0 + dx,
        y0 + dy,
        x1 + dx,
        y1 + dy,
      ]),
    })),
  }));
}
