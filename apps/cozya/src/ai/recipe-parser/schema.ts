import { z } from "zod";

export const recipeParserSchema = z.object({
  servings: z
    .number()
    .int()
    .min(1)
    .max(100)
    .nullable()
    .describe(
      "Rendimento em porções somente quando explícito na fonte. Nunca inferir; null se ausente.",
    ),
  totalMinutes: z
    .number()
    .int()
    .min(1)
    .max(10080)
    .nullable()
    .describe("Tempo total em minutos quando explícito; null se ausente."),
  sourceUrl: z
    .string()
    .max(2048)
    .nullable()
    .describe("URL da fonte fornecida, sem inventar links; null se não informada."),
  sourceName: z
    .string()
    .max(200)
    .nullable()
    .describe("Autor ou site explicitamente informado; null se desconhecido."),
  isValidRecipe: z
    .boolean()
    .describe(
      "true somente se o conteúdo contém UMA receita com ingredientes E preparo suficientes e legíveis. false para conteúdo incompleto, quantidades essenciais ilegíveis, receitas misturadas ou conteúdo não culinário.",
    ),
  reason: z
    .string()
    .max(200)
    .nullable()
    .describe(
      "Quando isValidRecipe=false, motivo curto em PT-BR explicando o que faltou (ex: 'O conteúdo não menciona ingredientes nem modo de preparo', 'A foto não mostra uma receita'). Null quando isValidRecipe=true.",
    ),
  name: z
    .string()
    .min(1)
    .max(120)
    .nullable()
    .describe(
      "Nome curto e descritivo da receita (até 120 caracteres). Use o nome dito pelo usuário, ou infira a partir dos ingredientes principais quando não dito explicitamente. Null quando isValidRecipe=false.",
    ),
  ingredients: z
    .string()
    .min(1)
    .max(5000)
    .nullable()
    .describe(
      "Lista de ingredientes, UM por linha, sem marcadores. Inclua quantidade e unidade quando ditas (ex: '500g de farinha', '3 ovos'). Null quando isValidRecipe=false.",
    ),
  preparation: z
    .string()
    .min(1)
    .max(5000)
    .nullable()
    .describe(
      "Modo de preparo em ordem cronológica, UM PASSO por linha, sem listas numeradas. Preserve os tempos e temperaturas originais. Null quando isValidRecipe=false.",
    ),
  finishing: z
    .string()
    .min(1)
    .max(5000)
    .nullable()
    .describe(
      "Etapa de finalização (cobertura, decoração, servir) quando explicitamente mencionada pelo usuário. Null quando não houver — não retorne string vazia.",
    ),
});

export type RecipeParserOutput = z.infer<typeof recipeParserSchema>;
