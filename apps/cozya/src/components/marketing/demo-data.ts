import { consolidateShopping, parseIngredients } from "@/features/kitchen/ingredients";
import { STARTER_RECIPES } from "@/features/kitchen/starter-recipes";

function recipeNamed(name: string) {
  const recipe = STARTER_RECIPES.find((item) => item.name === name);
  if (!recipe) throw new Error(`Missing Cozya demonstration recipe: ${name}`);
  return {
    ...recipe,
    servings: recipe.servings ?? null,
    parsedIngredients: parseIngredients(recipe.ingredients),
  };
}

export const DEMO_MEALS = [
  {
    id: "pasta",
    day: "Segunda",
    shortDay: "SEG",
    recipe: recipeNamed("Macarrão com tomate e grão-de-bico"),
    portions: 4,
  },
  {
    id: "omelet",
    day: "Terça",
    shortDay: "TER",
    recipe: recipeNamed("Omelete de abobrinha"),
    portions: 2,
  },
  {
    id: "rice",
    day: "Quarta",
    shortDay: "QUA",
    recipe: recipeNamed("Arroz com lentilha e cenoura"),
    portions: 4,
  },
] as const;

export const DEMO_OMELET = DEMO_MEALS[1].recipe;

/** The real consolidation, with the omelette cooked for the table plus the lunchboxes. */
export function demoShopping(omeletPortions: number) {
  return consolidateShopping(
    DEMO_MEALS.map((meal) => ({
      recipeId: meal.id,
      name: meal.recipe.name,
      baseServings: meal.recipe.servings,
      servings: meal.id === "omelet" ? omeletPortions : meal.portions,
      ingredients: meal.recipe.parsedIngredients,
    })),
  );
}
