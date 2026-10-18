import { describe, expect, it } from "vitest";
import { consolidateShopping, parseIngredients, type ShoppingLine } from "./ingredients";
import { checkMealOnList, mealShoppingKeys } from "./meal-shopping";

type Recipe = { id: string; name: string; servings: number | null; ingredients: string };
type ListItem = ShoppingLine & { id: string; state: "todo" | "have" | "bought" };

const strogonoff: Recipe = {
  id: "strogonoff",
  name: "Strogonoff de frango",
  servings: 4,
  ingredients:
    "600 g de peito de frango em cubos\n1 cebola picada\n1 caixa de creme de leite\nsal a gosto",
};
const omelete: Recipe = {
  id: "omelete",
  name: "Omelete de abobrinha",
  servings: 2,
  ingredients: "4 ovos\n1 abobrinha pequena ralada\nsal a gosto",
};

/** The week's list as `generateShoppingList` saves it, with every line already in the house. */
function listOf(meals: { recipe: Recipe; servings: number }[]) {
  return consolidateShopping(
    meals.map(({ recipe, servings }) => ({
      recipeId: recipe.id,
      name: recipe.name,
      baseServings: recipe.servings,
      servings,
      ingredients: parseIngredients(recipe.ingredients),
    })),
  ).map((line): ListItem => ({ ...line, id: line.key, state: "have" }));
}

describe("o que a lista diz do jantar de hoje", () => {
  it("diz tudo em casa só com a lista em dia, com a receita inteira e nada a comprar", () => {
    const items = listOf([{ recipe: strogonoff, servings: 4 }]);
    expect(checkMealOnList(mealShoppingKeys(strogonoff, 4), { stale: false, items })).toEqual({
      state: "complete",
    });
  });

  it("não diz tudo em casa para uma receita que não está na lista", () => {
    // A lista foi montada com o strogonoff; a omelete entrou na semana depois.
    const items = listOf([{ recipe: strogonoff, servings: 4 }]);
    // O sal da omelete já está na lista, marcado: antes, isso bastava para "tudo em casa".
    expect(checkMealOnList(mealShoppingKeys(omelete, 2), { stale: true, items })).toEqual({
      state: "not-on-list",
    });
  });

  it("não diz tudo em casa quando a semana mudou depois da lista", () => {
    const items = listOf([{ recipe: strogonoff, servings: 4 }]);
    expect(checkMealOnList(mealShoppingKeys(strogonoff, 4), { stale: true, items })).toEqual({
      state: "stale",
    });
  });

  it("aponta o que falta comprar", () => {
    const items = listOf([{ recipe: strogonoff, servings: 4 }]).map(
      (item): ListItem => (item.name === "Creme de leite" ? { ...item, state: "todo" } : item),
    );
    const result = checkMealOnList(mealShoppingKeys(strogonoff, 4), { stale: false, items });
    expect(result?.state).toBe("missing");
    expect(result?.state === "missing" && result.items.map((item) => item.name)).toEqual([
      "Creme de leite",
    ]);
  });

  it("acha na lista as linhas de conferir de uma receita sem rendimento", () => {
    const noYield = { ...omelete, id: "sem-rendimento", servings: null };
    const items = listOf([{ recipe: noYield, servings: 3 }]);
    expect(checkMealOnList(mealShoppingKeys(noYield, 3), { stale: false, items })).toEqual({
      state: "complete",
    });
  });

  it("não diz nada sem lista ou sem nada a comprar", () => {
    expect(checkMealOnList(mealShoppingKeys(strogonoff, 4), null)).toBeNull();
    expect(checkMealOnList([], { stale: false, items: [] })).toBeNull();
  });
});
