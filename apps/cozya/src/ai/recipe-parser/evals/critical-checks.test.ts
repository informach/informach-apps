import { describe, expect, it } from "vitest";
import type { RecipeParserOutput } from "../schema";
import { criticalIssues } from "./critical-checks";

const recipe: RecipeParserOutput = {
  isValidRecipe: true,
  reason: null,
  name: "Arroz",
  ingredients: "200 g de arroz",
  preparation: "Cozinhe o arroz.",
  finishing: null,
  servings: 2,
  totalMinutes: 20,
  sourceUrl: null,
  sourceName: null,
};
describe("critical culinary fidelity checks", () => {
  const expected = { isValidRecipe: true, ingredientPatterns: ["200\\s*g\\b"], servings: 2 };
  it("rejects changed quantities and units even when the ingredient name remains correct", () => {
    expect(criticalIssues(recipe, expected)).toEqual([]);
    expect(criticalIssues({ ...recipe, ingredients: "20 g de arroz" }, expected)).not.toEqual([]);
    expect(criticalIssues({ ...recipe, ingredients: "200 kg de arroz" }, expected)).not.toEqual([]);
  });
  it("does not score a refusal that still supplies a recipe as safe", () => {
    expect(criticalIssues({ ...recipe, isValidRecipe: false }, { isValidRecipe: false })).toContain(
      "refusal-with-recipe-content",
    );
  });
  it("requires a reason and no recipe content for an allowed live-search refusal", () => {
    const refusal = {
      ...recipe,
      isValidRecipe: false,
      reason: "Fonte não encontrada",
      ingredients: null,
      preparation: null,
    };
    expect(criticalIssues(refusal, { ...expected, allowSafeRefusal: true })).toEqual([]);
    expect(
      criticalIssues({ ...refusal, reason: null }, { ...expected, allowSafeRefusal: true }),
    ).toContain("validity");
  });
});
