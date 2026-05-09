import { describe, expect, it } from "vitest";
import { recipeParserSchema } from "./schema";

describe("recipeParserSchema", () => {
  it("requires nullable fields to be present for strict structured output", () => {
    expect(recipeParserSchema.safeParse({ isValidRecipe: false }).success).toBe(false);

    expect(
      recipeParserSchema.safeParse({
        isValidRecipe: false,
        reason: "O conteúdo não descreve uma receita.",
        name: null,
        ingredients: null,
        preparation: null,
        finishing: null,
      }).success,
    ).toBe(true);
  });
});
