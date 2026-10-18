import { consolidateShopping, parseIngredients } from "./ingredients";

/**
 * The lines one planned meal puts on the week's list, by key. It is the same consolidation the
 * list makes, so a recipe without yield (lines to review) or with "a gosto" matches the list.
 */
export function mealShoppingKeys(
  recipe: { id: string; name: string; servings: number | null; ingredients: string },
  servings: number,
): string[] {
  return consolidateShopping([
    {
      recipeId: recipe.id,
      name: recipe.name,
      baseServings: recipe.servings,
      servings,
      ingredients: parseIngredients(recipe.ingredients),
    },
  ]).map((line) => line.key);
}

type ListItem = { id: string; key: string; name: string; state: "todo" | "have" | "bought" };

/**
 * What the list says about one meal. "complete" is the only answer that allows "Tudo em casa":
 * the list is up to date, has every line of the meal and none of them is still to buy.
 */
export type MealOnList =
  /** Lines of the meal the list does not have: the meal entered the week after the list. */
  | { state: "not-on-list" }
  /** Lines of the meal still unchecked on the list. */
  | { state: "missing"; items: ListItem[] }
  /** Everything of the meal is checked, but the week changed after the list was made. */
  | { state: "stale" }
  | { state: "complete" };

/** Null when there is nothing to say: no list for that week, or a meal with nothing to buy. */
export function checkMealOnList(
  keys: readonly string[],
  list: { stale: boolean; items: readonly ListItem[] } | null,
): MealOnList | null {
  if (!list || keys.length === 0) return null;
  const onList = new Set(list.items.map((item) => item.key));
  if (keys.some((key) => !onList.has(key))) return { state: "not-on-list" };
  const missing = list.items.filter((item) => keys.includes(item.key) && item.state === "todo");
  if (missing.length > 0) return { state: "missing", items: missing };
  return list.stale ? { state: "stale" } : { state: "complete" };
}
