export function parseIngredients(ingredients: string): string[] {
  return ingredients
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function countIngredients(ingredients: string): number {
  return parseIngredients(ingredients).length;
}

type ShareableRecipe = {
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string | null;
  servings?: number | null;
  totalMinutes?: number | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
};

export function buildWhatsappShareUrl(recipe: ShareableRecipe): string {
  const lines = [
    `*${recipe.name}*`,
    ...(recipe.servings ? [`Rendimento: ${recipe.servings} porções`] : []),
    ...(recipe.totalMinutes ? [`Tempo total: ${recipe.totalMinutes} minutos`] : []),
    "",
    "*Ingredientes:*",
    recipe.ingredients,
    "",
    "*Modo de preparo:*",
    recipe.preparation,
  ];
  if (recipe.finishing && recipe.finishing.trim().length > 0) {
    lines.push("", "*Finalização:*", recipe.finishing);
  }
  if (recipe.sourceName || recipe.sourceUrl)
    lines.push("", `Fonte: ${[recipe.sourceName, recipe.sourceUrl].filter(Boolean).join(" · ")}`);
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}
