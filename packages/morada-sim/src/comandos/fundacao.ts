import { z } from "zod";
import { FASES } from "../dominio/tipos";

/** Limite do pedido na rede; o limite jogável é o das regras do mundo. */
const MAXIMO_NO_PEDIDO = 32;
export const TRACOS_DA_FUNDACAO = [
  "carinhoso",
  "caseiro",
  "extrovertido",
  "curioso",
  "tranquilo",
  "criativo",
] as const;
const nome = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[^\p{Cc}]*$/u);
const itemDeAparencia = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const indice = z
  .number()
  .int()
  .min(0)
  .max(MAXIMO_NO_PEDIDO - 1);

/** Índices são referências locais ao rascunho, nunca IDs de entidades do mundo. */
export const RascunhoDaFamiliaSchema = z.strictObject({
  nome,
  moradores: z
    .array(
      z.strictObject({
        nome,
        fase: z.enum(FASES),
        linha: z.enum(["f", "m"]),
        pele: z.number().int().min(0).max(0xffffff),
        cabelo: itemDeAparencia,
        roupa: itemDeAparencia,
        tracos: z.array(z.enum(TRACOS_DA_FUNDACAO)).max(3),
      }),
    )
    .min(1)
    .max(MAXIMO_NO_PEDIDO),
  relacoes: z
    .array(
      z.strictObject({
        a: indice,
        b: indice,
        /** Em genitor, a é pai/mãe de b. O gênero visual não determina parentesco. */
        tipo: z.enum(["genitor", "irmaos", "namoro", "casamento"]),
      }),
    )
    .max(128),
});
export type RascunhoDaFamilia = z.infer<typeof RascunhoDaFamiliaSchema>;

export type ImpedimentoDaFundacao =
  | "limite_de_moradores"
  | "sem_adulto"
  | "tracos_repetidos"
  | "referencia_invalida"
  | "relacao_repetida"
  | "fase_incompativel"
  | "genitores_excedidos"
  | "parentesco_ciclico"
  | "parentesco_incompativel"
  | "casal_repetido"
  | "parentes_com_casal";

const par = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const adulto = (fase: (typeof FASES)[number]) => fase === "adulto" || fase === "idoso";

/** Regras de personagens fictícios; não verifica idade ou responsabilidade de uma conta. */
export function impedimentoDaFundacao(
  rascunho: RascunhoDaFamilia,
  maxMoradores: number,
): ImpedimentoDaFundacao | null {
  const moradores = rascunho.moradores;
  if (moradores.length > maxMoradores) return "limite_de_moradores";
  if (!moradores.some((morador) => adulto(morador.fase))) return "sem_adulto";
  if (moradores.some((morador) => new Set(morador.tracos).size !== morador.tracos.length))
    return "tracos_repetidos";

  const pares = new Set<string>();
  const genitores = moradores.map(() => new Set<number>());
  const filhos = moradores.map(() => new Set<number>());
  const irmaos = new Set<string>();
  const casais: { a: number; b: number }[] = [];
  const comprometidos = new Set<number>();
  for (const relacao of rascunho.relacoes) {
    const a = moradores[relacao.a];
    const b = moradores[relacao.b];
    if (!a || !b || relacao.a === relacao.b) return "referencia_invalida";
    const chave = par(relacao.a, relacao.b);
    if (pares.has(chave)) return "relacao_repetida";
    pares.add(chave);
    if (relacao.tipo === "genitor") {
      if (!adulto(a.fase) || FASES.indexOf(a.fase) < FASES.indexOf(b.fase))
        return "fase_incompativel";
      genitores[relacao.b]?.add(relacao.a);
      filhos[relacao.a]?.add(relacao.b);
      if ((genitores[relacao.b]?.size ?? 0) > 2) return "genitores_excedidos";
    } else if (relacao.tipo === "irmaos") {
      irmaos.add(chave);
    } else {
      if (!adulto(a.fase) || !adulto(b.fase)) return "fase_incompativel";
      if (comprometidos.has(relacao.a) || comprometidos.has(relacao.b)) return "casal_repetido";
      comprometidos.add(relacao.a);
      comprometidos.add(relacao.b);
      casais.push(relacao);
    }
  }

  const descendente = (de: number, ate: number): boolean => {
    const vistos = new Set<number>();
    const visitar = [...(filhos[de] ?? [])];
    while (visitar.length) {
      const atual = visitar.pop();
      if (atual === undefined || vistos.has(atual)) continue;
      if (atual === ate) return true;
      vistos.add(atual);
      visitar.push(...(filhos[atual] ?? []));
    }
    return false;
  };
  for (let a = 0; a < moradores.length; a++) {
    if (descendente(a, a)) return "parentesco_ciclico";
    for (let b = a + 1; b < moradores.length; b++) {
      const mesmoGenitor = [...(genitores[a] ?? [])].some((g) => genitores[b]?.has(g));
      if (mesmoGenitor) irmaos.add(par(a, b));
      if (irmaos.has(par(a, b)) && (descendente(a, b) || descendente(b, a)))
        return "parentesco_incompativel";
    }
  }
  for (const { a, b } of casais) {
    if (irmaos.has(par(a, b)) || descendente(a, b) || descendente(b, a))
      return "parentes_com_casal";
  }
  return null;
}
