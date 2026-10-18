import { cookedAgo, daysBetween } from "./dates";

/** A recipe as the week editor offers it. */
export type RecipeChoice = {
  id: string;
  name: string;
  servings: number | null;
  totalMinutes: number | null;
  isFavorite: boolean;
  ingredients: string;
  lastCookedAt: Date | null;
  verdict: "again" | "tweak" | "skip" | null;
};

function plain(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** By name or by ingredient: "frango", "abobrinha". Accents and case do not matter. */
export function matchesSearch(recipe: RecipeChoice, search: string) {
  return plain(`${recipe.name} ${recipe.ingredients}`).includes(plain(search.trim()));
}

export function choiceMeta(recipe: RecipeChoice, now: Date) {
  const parts = [recipe.servings ? `rende ${recipe.servings}` : "rendimento a conferir"];
  if (recipe.verdict === "skip") parts.push("você disse que não repetiria");
  else parts.push(recipe.lastCookedAt ? cookedAgo(recipe.lastCookedAt, now) : "ainda não fez");
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "faz um mês", "ainda não fez": why a recipe is a good pick for an open day. */
export function sinceLabel(recipe: RecipeChoice, now: Date) {
  if (!recipe.lastCookedAt) return "ainda não fez";
  const days = daysBetween(new Date(recipe.lastCookedAt), now);
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return months === 1 ? "faz um mês" : `faz ${months} meses`;
  }
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "faz uma semana" : `faz ${weeks} semanas`;
  }
  return cookedAgo(recipe.lastCookedAt, now);
}

/** Favorites first, then what has not been cooked for the longest; "não repetiria" last. */
export function byFavoriteAndTime(a: RecipeChoice, b: RecipeChoice) {
  const skip = Number(a.verdict === "skip") - Number(b.verdict === "skip");
  if (skip) return skip;
  const favorite = Number(b.isFavorite) - Number(a.isFavorite);
  if (favorite) return favorite;
  const at = a.lastCookedAt ? new Date(a.lastCookedAt).getTime() : Number.POSITIVE_INFINITY;
  const bt = b.lastCookedAt ? new Date(b.lastCookedAt).getTime() : Number.POSITIVE_INFINITY;
  return at - bt || a.name.localeCompare(b.name, "pt-BR");
}

/** Three recipes for an open day: one not made for a while, one never made, one favorite. */
export function suggestionsFor(recipes: RecipeChoice[], inWeek: Set<string>, now: Date) {
  const pool = recipes
    .filter((recipe) => recipe.verdict !== "skip" && !inWeek.has(recipe.id))
    .sort(byFavoriteAndTime);
  const old = pool
    .filter(
      (recipe) => recipe.lastCookedAt && daysBetween(new Date(recipe.lastCookedAt), now) >= 14,
    )
    .sort(
      (a, b) => new Date(a.lastCookedAt ?? 0).getTime() - new Date(b.lastCookedAt ?? 0).getTime(),
    )
    .at(0);
  const never = pool.find((recipe) => !recipe.lastCookedAt && recipe !== old);
  const favorite = pool.find((recipe) => recipe.isFavorite && recipe !== old && recipe !== never);
  const picks = [...new Set([old, never, favorite, ...pool].filter(Boolean))].slice(0, 3);
  return (picks as RecipeChoice[]).map((recipe) => ({
    recipe,
    reason:
      recipe.isFavorite && recipe !== old && recipe !== never
        ? "favorita"
        : sinceLabel(recipe, now),
  }));
}
