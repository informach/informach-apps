import { z } from "zod";

/**
 * Previsão e observação do ciclo "prever → manipular → observar → explicar".
 *
 * O laboratório começava na manipulação, então a criança mexia nos controles
 * sem se comprometer com uma hipótese — e sem hipótese não há surpresa nem
 * descoberta. As duas anotações viajam dentro do próprio estado salvo, que já é
 * `jsonb`, e por isso não exigem coluna nova. Experimentos salvos antes desta
 * versão não têm as chaves e caem no padrão vazio.
 */
const anotacoes = {
  previsao: z.string().trim().max(280).default(""),
  observacao: z.string().trim().max(280).default(""),
};

export const experimentSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("bars"),
      initial: z.number().min(20).max(500),
      first: z.number().min(0).max(60),
      second: z.number().min(0).max(60),
      ...anotacoes,
    }),
    z.object({
      kind: z.literal("grid"),
      cells: z.array(z.boolean()).length(20),
      ...anotacoes,
    }),
    z.object({
      kind: z.literal("groups"),
      groups: z.number().int().min(2).max(6),
      tokens: z
        .array(
          z.object({ id: z.number().int().min(0).max(10000), box: z.number().int().min(0).max(5) }),
        )
        .min(1)
        .max(12),
      ...anotacoes,
    }),
  ])
  .refine(
    (value) =>
      value.kind !== "groups" ||
      (new Set(value.tokens.map((t) => t.id)).size === value.tokens.length &&
        value.tokens.every((t) => t.box < value.groups)),
    "Invalid groups",
  );
export type Experiment = z.infer<typeof experimentSchema>;
/**
 * O que um chamador pode enviar: previsão e observação são opcionais na
 * entrada, porque montagens salvas antes desta versão não as tinham. Quem
 * grava normaliza pelo schema, então o formato persistido é sempre o completo.
 */
export type ExperimentInput = z.input<typeof experimentSchema>;
export type SavedExperiment = { state: Experiment; revision: number };
