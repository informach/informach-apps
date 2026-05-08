import { generateObject } from "ai";
import { z } from "zod";
import type { Scorer } from "./types";

/**
 * Scorer LLM-as-judge: verifica se o agent extraiu TODOS os ingredientes
 * mencionados na entrada. Pega 3 sinais e devolve um score 0–1.
 *
 * Heurística:
 *  - 1.0 = todos os ingredientes mencionados aparecem na lista, com quantidade
 *    quando dita, e não há "ingrediente fantasma" inferido na lista.
 *  - 0.7 = falta 1 ingrediente óbvio OU 1 quantidade está errada/perdida.
 *  - 0.4 = > 1 falta OU lista mistura ingredientes não mencionados.
 *  - 0.0 = `output.ingredients` está vazio em uma entrada que claramente
 *    descreve uma receita.
 *
 * Pula (devolve 1.0) quando `output.isValidRecipe === false` — esse caso é
 * coberto pelo `scopeAdherenceScorer`.
 */
const judgeSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("0 = lista totalmente errada, 1 = todos os ingredientes corretos com quantidades"),
  reason: z
    .string()
    .min(1)
    .max(400)
    .describe("Explicação curta em PT-BR sobre o que faltou ou sobrou"),
  missingIngredients: z
    .array(z.string())
    .nullish()
    .describe("Ingredientes mencionados na entrada mas ausentes da lista extraída"),
  hallucinatedIngredients: z
    .array(z.string())
    .nullish()
    .describe("Ingredientes na lista extraída que não aparecem na entrada"),
});

export const ingredientCompletenessScorer: Scorer = {
  name: "ingredient-completeness",
  usesLlm: true,
  async score({ input, output }, { judge }) {
    if (output.isValidRecipe === false) {
      return {
        score: 1,
        reason: "Skipped: output.isValidRecipe = false (scope-adherence covers this)",
      };
    }
    const inputAsText = typeof input === "string" ? input : JSON.stringify(input).slice(0, 4000);

    const result = await generateObject({
      model: judge,
      schema: judgeSchema,
      prompt: [
        "Você é um juiz que avalia se um parser de receitas extraiu corretamente todos os ingredientes.",
        "",
        "ENTRADA original (texto, transcrição ou descrição):",
        inputAsText,
        "",
        "INGREDIENTES extraídos pelo parser:",
        output.ingredients ?? "(vazio)",
        "",
        "Tarefa:",
        "1. Liste ingredientes mencionados na entrada que não estão nos extraídos (`missingIngredients`).",
        "2. Liste ingredientes nos extraídos que não aparecem na entrada (`hallucinatedIngredients`).",
        "3. Atribua um `score` 0–1 conforme a heurística:",
        "   - 1.0 = todos os ingredientes corretos com quantidades; nada inventado.",
        "   - 0.7 = falta 1 ingrediente óbvio OU 1 quantidade errada/perdida.",
        "   - 0.4 = > 1 falta OU lista mistura ingredientes não mencionados.",
        "   - 0.0 = lista vazia em uma receita real.",
        "4. Justifique em uma frase curta em PT-BR (`reason`).",
      ].join("\n"),
    });

    return {
      score: result.object.score,
      reason: result.object.reason,
      details: {
        missingIngredients: result.object.missingIngredients ?? [],
        hallucinatedIngredients: result.object.hallucinatedIngredients ?? [],
      },
    };
  },
};
