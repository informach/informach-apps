import { ingredientCompletenessScorer } from "./ingredient-completeness-scorer";
import { schemaValidityScorer } from "./schema-validity-scorer";
import { scopeAdherenceScorer } from "./scope-adherence-scorer";
import type { Scorer } from "./types";

export const ALL_SCORERS: readonly Scorer[] = [
  schemaValidityScorer,
  scopeAdherenceScorer,
  ingredientCompletenessScorer,
];

export type { ScoreInput, ScoreResult, Scorer, ScorerContext } from "./types";
export { ingredientCompletenessScorer, schemaValidityScorer, scopeAdherenceScorer };
