import { recipeParserSchema } from "../schema";
import type { Scorer } from "./types";

/**
 * Scorer binário: valida que o `output` do agent passa no `recipeParserSchema`.
 *
 * Por que isto importa: o agent é configurado com `errorStrategy: "strict"`
 * em produção, então um output inválido vira exception. Mas durante eval
 * podemos receber objetos parcialmente preenchidos (ex.: `isValidRecipe: true`
 * com `name: null`) que o `errorStrategy` deixaria passar mas que rompem
 * invariantes específicos do nosso schema (ex.: `min(1).max(120)` em `name`).
 *
 * Score = 1 quando válido; 0 quando inválido. Reason inclui o primeiro erro
 * do Zod para diagnóstico.
 */
export const schemaValidityScorer: Scorer = {
  name: "schema-validity",
  usesLlm: false,
  async score({ output }) {
    const result = recipeParserSchema.safeParse(output);
    if (result.success) {
      return { score: 1, reason: "Output passes recipeParserSchema" };
    }
    const firstIssue = result.error.issues[0];
    return {
      score: 0,
      reason: firstIssue
        ? `Schema invalid at ${firstIssue.path.join(".") || "<root>"}: ${firstIssue.message}`
        : "Schema invalid (no issue detail)",
      details: { issues: result.error.issues },
    };
  },
};
