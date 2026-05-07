import { z } from "zod";

export const recipeParserSchema = z.object({
  isValidRecipe: z
    .boolean()
    .describe(
      "true se o conteúdo (áudio transcrito, texto colado ou foto) descreve uma receita culinária com ingredientes e/ou modo de preparo identificáveis. false se for outra coisa (mensagem aleatória, conversa, conteúdo em branco, imagem não-culinária).",
    ),
  reason: z
    .string()
    .max(200)
    .nullish()
    .describe(
      "Quando isValidRecipe=false, motivo curto em PT-BR explicando o que faltou (ex: 'O conteúdo não menciona ingredientes nem modo de preparo', 'A foto não mostra uma receita'). Null quando isValidRecipe=true.",
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
    .min(1)
    .max(5000)
    .nullish()
    .describe(
      "Etapa de finalização (cobertura, decoração, servir) quando explicitamente mencionada pelo usuário. Null quando não houver — não retorne string vazia.",
    ),
});

export type RecipeParserOutput = z.infer<typeof recipeParserSchema>;
