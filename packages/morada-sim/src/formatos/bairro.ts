import { z } from "zod";
import { FASES } from "../dominio/tipos";

/**
 * Um mundo é descrito como dados: bairro, lotes, tamanho, casa inicial e quem
 * mora lá. Não é uma cena montada à mão. Os mundos de verdade são montados
 * depois com a biblioteca da cidade e as casas prontas, sem mudar o servidor
 * nem o formato salvo.
 */

const mm = z.number().int();
const ponto = z.tuple([mm, mm]);
const mil = z.number().int().min(0).max(1_000_000);
const ref = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const MoradorInicialSchema = z.strictObject({
  /** Nome curto para o arquivo se referir a este morador. */
  ref,
  nome: z.string().min(1).max(24),
  fase: z.enum(FASES),
  linha: z.enum(["f", "m"]),
  /** Tom de pele, como cor RGB inteira. */
  pele: z.number().int().min(0).max(0xffffff),
  cabelo: z.string(),
  roupa: z.string(),
  tracos: z.array(z.string()).max(3),
  habilidades: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type MoradorInicial = z.infer<typeof MoradorInicialSchema>;

export const RelacaoInicialSchema = z.strictObject({
  a: ref,
  b: ref,
  amizade: mil.optional(),
  romance: mil.optional(),
  confianca: mil.optional(),
  casal: z.enum(["nenhum", "namoro", "casamento", "ex"]).optional(),
  /** `genitor`: `a` é pai ou mãe de `b`. */
  parentesco: z.enum(["genitor", "irmaos"]).optional(),
});
export type RelacaoInicial = z.infer<typeof RelacaoInicialSchema>;

export const LoteInicialSchema = z.strictObject({
  ref,
  /** Canto do lote no bairro. */
  origem: ponto,
  tamanho: ponto,
  /** Onde alguém aparece ao chegar, em coordenadas do lote. */
  entrada: ponto,
  imovel: z
    .strictObject({
      /** Modelo de imóvel, como `id@versao`. */
      modelo: z.string().regex(/^[a-z][a-z0-9_]*@\d+$/),
      /** Onde a origem do modelo fica no lote. */
      posicao: ponto,
    })
    .nullable(),
});

export const FamiliaInicialSchema = z.strictObject({
  ref,
  nome: z.string().min(1).max(24),
  lote: ref,
  /** Em centavos. */
  fundo: z.number().int().nonnegative(),
  moradores: z.array(MoradorInicialSchema).min(1),
});

export const DefinicaoDeBairroSchema = z.strictObject({
  formato: z.literal("morada.bairro"),
  versao: z.literal(1),
  id: ref,
  nome: z.string().min(1),
  tamanho: ponto,
  lotes: z.array(LoteInicialSchema).min(1),
  familias: z.array(FamiliaInicialSchema),
  /** Moradores do bairro sem família jogável: vivem fora dos lotes e visitam. */
  avulsos: z.array(MoradorInicialSchema),
  relacoes: z.array(RelacaoInicialSchema),
});
export type DefinicaoDeBairro = z.infer<typeof DefinicaoDeBairroSchema>;
