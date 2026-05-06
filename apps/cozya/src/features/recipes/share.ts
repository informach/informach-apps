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
};

export function buildWhatsappShareUrl(recipe: ShareableRecipe): string {
  const lines = [
    `*${recipe.name}*`,
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
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}
