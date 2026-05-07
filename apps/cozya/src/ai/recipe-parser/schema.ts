import { z } from "zod";

export const recipeParserSchema = z.object({
  isValidRecipe: z
    .boolean()
    .describe(
      "true se o áudio descreve uma receita culinária com ingredientes e/ou modo de preparo identificáveis. false se for outra coisa (mensagem aleatória, conversa, áudio em branco).",
    ),
  reason: z
    .string()
    .max(200)
    .nullish()
    .describe(
      "Quando isValidRecipe=false, motivo curto em PT-BR explicando o que faltou (ex: 'O áudio não menciona ingredientes nem modo de preparo'). Null quando isValidRecipe=true.",
    ),
  name: z
    .string()
    .min(1)
    .max(120)
    .nullish()
    .describe(
      "Nome curto e descritivo da receita (até 120 caracteres). Use o nome dito pelo usuário, ou infira a partir dos ingredientes principais quando não dito explicitamente. Null quando isValidRecipe=false.",
    ),
  ingredients: z
    .string()
    .min(1)
    .max(5000)
    .nullish()
    .describe(
      "Lista de ingredientes, UM por linha, sem marcadores. Inclua quantidade e unidade quando ditas (ex: '500g de farinha', '3 ovos'). Null quando isValidRecipe=false.",
    ),
  preparation: z
    .string()
    .min(1)
    .max(5000)
    .nullish()
    .describe(
      "Modo de preparo em parágrafo único, em ordem cronológica, sem listas numeradas. Null quando isValidRecipe=false.",
    ),
  finishing: z
    .string()
    .max(5000)
    .nullish()
    .describe(
      "Etapa de finalização (cobertura, decoração, servir) quando explicitamente mencionada pelo usuário. Null quando não houver.",
    ),
});

export type RecipeParserOutput = z.infer<typeof recipeParserSchema>;
