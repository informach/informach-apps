import { generateText, Output } from "ai";
import { z } from "zod";
import type { Scorer } from "./types";

/**
 * Scorer LLM-as-judge inspirado no `scopeAdherenceScorer` do repo do Branas.
 * Mede dois lados do mesmo erro de classificação:
 *
 * - "Conteúdo NÃO é receita mas o agent retornou `isValidRecipe: true`" — o
 *   parser inventou uma receita a partir de texto solto.
 * - "Conteúdo É receita mas o agent retornou `isValidRecipe: false`" — o
 *   parser recusou indevidamente.
 *
 * Score binário:
 *  - 1.0 = classificação correta (`isValidRecipe` bate com a expectativa).
 *  - 0.0 = classificação errada.
 *
 * O dataset traz `expected.isValidRecipe`. Quando ausente, o scorer
 * delega para um juiz LLM que decide se a entrada descreve receita ou não.
 */
const judgeSchema = z.object({
  inputDescribesRecipe: z
    .boolean()
    .describe(
      "true se a entrada descreve uma receita culinária com ingredientes ou modo de preparo",
    ),
  reason: z.string().min(1).max(300),
});

export const scopeAdherenceScorer: Scorer = {
  name: "scope-adherence",
  usesLlm: true,
  async score({ input, output, expected }, { judge }) {
    const expectedFlag = (expected as { isValidRecipe?: boolean } | undefined)?.isValidRecipe;
    let groundTruth: boolean;
    let reasonSource: string;

    if (typeof expectedFlag === "boolean") {
      groundTruth = expectedFlag;
      reasonSource = "dataset expected.isValidRecipe";
    } else {
      const inputAsText = typeof input === "string" ? input : JSON.stringify(input).slice(0, 4000);
      const result = await generateText({
        model: judge,
        output: Output.object({ schema: judgeSchema }),
        prompt: [
          "Você é um juiz que decide se um conteúdo descreve uma receita culinária.",
          "",
          "ENTRADA:",
          inputAsText,
          "",
          "Conta como receita: tem pelo menos UM ingrediente OU um modo de preparo identificável.",
          "Não conta: conversa, listas não-culinárias, foto de paisagem, mensagem aleatória.",
          "",
          "Responda `inputDescribesRecipe` (boolean) e `reason` curto em PT-BR.",
        ].join("\n"),
      });
      groundTruth = result.output.inputDescribesRecipe;
      reasonSource = `LLM judge: ${result.output.reason}`;
    }

    const correct = output.isValidRecipe === groundTruth;
    return {
      score: correct ? 1 : 0,
      reason: correct
        ? `Classified correctly as ${output.isValidRecipe ? "recipe" : "non-recipe"} (${reasonSource})`
        : `Misclassified: model said ${output.isValidRecipe}, ground truth ${groundTruth} (${reasonSource})`,
      details: { groundTruth, modelClassification: output.isValidRecipe },
    };
  },
};
