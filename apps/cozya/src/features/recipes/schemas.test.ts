import { describe, expect, it } from "vitest";
import { recipeInputSchema } from "./schemas";

const baseRecipe = {
  name: "Bolo de cenoura",
  ingredients: "cenoura\nfarinha\novos",
  preparation: "Misture tudo e asse.",
  isFavorite: false,
};

describe("recipeInputSchema", () => {
  it("normalizes empty finishing to null", () => {
    const result = recipeInputSchema.parse({ ...baseRecipe, finishing: "" });

    expect(result.finishing).toBeNull();
  });

  it("accepts null finishing from transformed form submissions", () => {
    const result = recipeInputSchema.parse({ ...baseRecipe, finishing: null });

    expect(result.finishing).toBeNull();
  });

  it("trims filled finishing text", () => {
    const result = recipeInputSchema.parse({ ...baseRecipe, finishing: "  Sirva gelado.  " });

    expect(result.finishing).toBe("Sirva gelado.");
  });
});
