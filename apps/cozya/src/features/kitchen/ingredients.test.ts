import { describe, expect, it } from "vitest";
import { addDays, weekStart } from "./dates";
import {
  consolidateShopping,
  parseIngredientLine,
  parseIngredients,
  scaleIngredient,
} from "./ingredients";

describe("quantidades para cozinhar e comprar", () => {
  it("lê frações e vírgulas sem alterar o original", () => {
    expect(parseIngredientLine("1 1/2 xícaras de arroz")).toMatchObject({
      quantity: 1.5,
      unit: "xícara",
      name: "arroz",
      original: "1 1/2 xícaras de arroz",
    });
    expect(parseIngredientLine("0,5 kg de frango")).toMatchObject({ quantity: 0.5, unit: "kg" });
  });
  it.each([
    "2 a 3 ovos",
    "1/0 xícara de arroz",
    "sal a gosto",
    "um pouco de azeite",
    "1-2 tomates",
    "1.000 g de farinha",
    "2.500 ml de leite",
    "1,000 g de farinha",
  ])("mantém ambiguidade: %s", (line) => {
    expect(parseIngredientLine(line).quantity).toBeNull();
  });
  it("escala apenas quando o rendimento original é conhecido", () => {
    const ingredient = parseIngredientLine("2 ovos");
    expect(scaleIngredient(ingredient, 2, 3)).toBe("3 un ovos");
    expect(scaleIngredient(ingredient, null, 3)).toBe("2 ovos");
  });
  it("mantém medidas com separador ambíguo para conferência, inclusive nas compras", () => {
    const original = "1.000 g de farinha";
    const item = parseIngredientLine(original);
    expect(scaleIngredient(item, 4, 8)).toBe(original);
    expect(
      consolidateShopping([
        { recipeId: "a", name: "Pão", baseServings: 4, servings: 8, ingredients: [item] },
      ])[0],
    ).toMatchObject({ name: original, amount: "Conferir" });
    expect(parseIngredientLine("0.125 kg de farinha").quantity).toBe(0.125);
    expect(parseIngredientLine("1,5 kg de farinha").quantity).toBe(1.5);
  });
  it("consolida massa e volume, mas não converte xícara em gramas", () => {
    const result = consolidateShopping([
      {
        recipeId: "a",
        name: "Arroz",
        baseServings: 2,
        servings: 4,
        ingredients: parseIngredients("0,5 kg de arroz\n1 xícara de arroz\n250 ml de leite"),
      },
      {
        recipeId: "b",
        name: "Doce",
        baseServings: 2,
        servings: 2,
        ingredients: parseIngredients("100 g de arroz\n1 l de leite"),
      },
    ]);
    expect(result.map((line) => [line.key, line.amount])).toEqual(
      expect.arrayContaining([
        ["arroz:g", "1.100 g"],
        ["arroz:xícara", "2 xícara"],
        ["leite:ml", "1.500 ml"],
      ]),
    );
    expect(result).toHaveLength(3);
  });
  it("não inventa quantidades ao repetir receita sem rendimento", () => {
    const meal = {
      recipeId: "a",
      name: "Omelete",
      baseServings: null,
      servings: 4,
      ingredients: parseIngredients("2 ovos"),
    };
    const result = consolidateShopping([meal, meal]);
    expect(result[0]).toMatchObject({
      amount: "Conferir",
      name: "2 ovos",
      note: "Omelete: conferir quantidade para 2 preparos de 4 porções.",
    });
  });
  it("calcula semanas na virada do ano e no domingo", () => {
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});
