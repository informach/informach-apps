import { z } from "zod";

/**
 * A descrição de um personagem: o que o empacotador precisa para montar um
 * pacote. É o formato de "Salvar personagem" da página de referência (corpo,
 * pele, cabelo, roupa por parte com cor), com um id e um nome.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use uma cor #rrggbb");
const id = z.string().regex(/^[a-z][a-z0-9_]*$/, "use letras minúsculas, números e _");

export const PecaSchema = z.strictObject({
  /** Id da peça no catálogo de roupas. */
  id,
  /**
   * Cor livre da peça. `null` deixa a textura como está; sem o campo, vale a cor
   * inicial do catálogo (`variacao.cor`), como na página.
   */
  cor: hex.nullable().optional(),
});

export const PersonagemSchema = z.strictObject({
  /** Nome do pacote: vira o nome do arquivo. */
  id,
  nome: z.string().min(1).max(40),
  /** Corpo da biblioteca (`adulta`, `crianca_m`, `bebe_f`...). */
  corpo: id,
  /** Tom pronto da página (`Clara`, `Média`, `Morena`, `Escura`) ou uma cor `#rrggbb`. */
  pele: z.string().min(1),
  cabelo: z.strictObject({
    /** `cabelo` (o original do corpo), `cabelo_raspado`, `careca` ou um penteado do catálogo. */
    penteado: id,
    /** Cor com nome da página (`Castanho`, `Loiro`...) ou `#rrggbb`. Sem o campo, a cor inicial do corpo. */
    cor: z.string().min(1).optional(),
    /** Barba ou bigode do catálogo; `nenhum` para não ter. */
    barba: id.default("nenhum"),
  }),
  /** Uma peça por parte do corpo (`cima`, `baixo`, `inteira`, `pes`, `cabeca`...). */
  roupa: z.record(id, PecaSchema).default({}),
  /** Objeto em cada mão. O empacotador ainda não monta objetos de mão. */
  objetos: z.strictObject({ dir: PecaSchema.optional(), esq: PecaSchema.optional() }).default({}),
  /** Só no recém-nascido: cabelo, manta e chupeta. */
  recem: z
    .strictObject({
      cabelo: z.enum(["careca", "baixinho", "gorro"]).default("baixinho"),
      manta: z.string().min(1).default("Creme"),
      chupeta: z.boolean().default(true),
    })
    .optional(),
  /**
   * A aparência do morador na simulação para a qual este pacote foi feito
   * (`Aparencia` do `@informach/morada-sim`): o cliente acha o pacote por ela.
   */
  sim: z
    .strictObject({
      corpo: z.string(),
      pele: z.number().int().min(0).max(0xffffff),
      cabelo: z.string(),
      roupa: z.string(),
    })
    .optional(),
});

export type Peca = z.infer<typeof PecaSchema>;
export type Personagem = z.infer<typeof PersonagemSchema>;
/** A descrição como se escreve, com os campos opcionais ainda por preencher. */
export type PersonagemDeEntrada = z.input<typeof PersonagemSchema>;

export const ElencoDeEntradaSchema = z.strictObject({
  formato: z.literal("morada-elenco"),
  versao: z.literal(1),
  personagens: z.array(PersonagemSchema).min(1),
});
