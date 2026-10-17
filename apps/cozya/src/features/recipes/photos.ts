/** The source written on every recipe copied from the Cozya collection. */
export const STARTER_SOURCE = "Coleção Cozya · rascunho autoral, sem teste em cozinha";

/**
 * Dish photos the Cozya already has for the collection recipes they show. They are AI-generated
 * images of the sales page (`docs/proposals/cozya-home-2026-09-11/imagens-implementacao.md`),
 * not photos of the recipe cooked, so one enters only when it shows that dish and nothing the
 * recipe lacks. `marmitas.webp` stays out: its plates carry roasted vegetables that "Arroz com
 * lentilha e cenoura" does not have. A recipe of the house has no photo until the monorepo can
 * store files.
 */
const STARTER_PHOTOS: Readonly<Record<string, string>> = {
  "Macarrão com tomate e grão-de-bico": "/marketing/jantar.webp",
};

/** The dish photo for a collection recipe still under its collection name, or null. */
export function recipePhoto(recipe: { name: string; sourceName?: string | null }): string | null {
  if (recipe.sourceName !== STARTER_SOURCE) return null;
  return STARTER_PHOTOS[recipe.name] ?? null;
}
