import { describe, expect, it } from "vitest";
import { recipeInputSchema, updateRecipeInputSchema } from "./schemas";

const baseRecipe = {
  name: "Bolo de cenoura",
  ingredients: "cenoura\nfarinha\novos",
  preparation: "Misture tudo e asse.",
  isFavorite: false,
};

describe("recipeInputSchema", () => {
  it("defaults missing favorite flag to false when creating", () => {
    const result = recipeInputSchema.parse({
      name: "Bolo",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: null,
    });

    expect(result.isFavorite).toBe(false);
  });

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

describe("updateRecipeInputSchema", () => {
  it("requires the favorite flag instead of defaulting it during update", () => {
    const result = updateRecipeInputSchema.safeParse({
      id: "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5",
      name: "Bolo",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: null,
    });

    expect(result.success).toBe(false);
  });
});
