/** The source written on every recipe copied from the Cozya collection. */
export const STARTER_SOURCE = "Coleção Cozya · rascunho autoral, sem teste em cozinha";

/**
 * Dish photos the Cozya already has, from its own editorial shoot, for the collection recipes
 * they show. A recipe of the house has no photo until the monorepo can store files.
 */
const STARTER_PHOTOS: Readonly<Record<string, string>> = {
  "Macarrão com tomate e grão-de-bico": "/marketing/jantar.webp",
  "Arroz com lentilha e cenoura": "/marketing/marmitas.webp",
};

/** The dish photo for a collection recipe still under its collection name, or null. */
export function recipePhoto(recipe: { name: string; sourceName?: string | null }): string | null {
  if (recipe.sourceName !== STARTER_SOURCE) return null;
  return STARTER_PHOTOS[recipe.name] ?? null;
}
