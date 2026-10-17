import { listRecentPreviewCount } from "@/features/ai/previews";
import { getIsProForUser } from "@/features/billing/server-cache";
import { billing } from "@/features/billing/service";
import { getKitchenAccess } from "@/features/kitchen/access";
import { StarterCollection } from "@/features/kitchen/components/starter-collection";
import { weekStart } from "@/features/kitchen/dates";
import { getWeekMeals } from "@/features/kitchen/repository";
import { RecipesSection } from "@/features/recipes/components/recipes-section";
import type { RecipeFilter } from "@/features/recipes/repository";
import { countUserRecipes, listRecipesForUser } from "@/features/recipes/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Suas receitas | Cozya" };

const RECIPE_PAGE_SIZE = 48;
const FILTERS: RecipeFilter[] = ["favoritas", "rapidas", "rendem", "tempo"];

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = single(params.q).trim().slice(0, 120);
  const filterParam = single(params.filtro);
  const filter = (FILTERS as string[]).includes(filterParam) ? (filterParam as RecipeFilter) : null;
  const pageNumber = Number(single(params.page));
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const user = await requireUserServer();
  const [recipeCount, isPro, recipesPage, access, meals, previews] = await Promise.all([
    countUserRecipes(user.id),
    getIsProForUser(user.id),
    listRecipesForUser(user.id, {
      search: query,
      filter: filter ?? undefined,
      page,
      limit: RECIPE_PAGE_SIZE,
    }),
    getKitchenAccess(user.id),
    getWeekMeals(user.id, weekStart()),
    listRecentPreviewCount(user.id),
  ]);
  const credits = access.canUseAi
    ? (await billing.getBalance({ type: "user", id: user.id })).available
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="space-y-1">
        <h1 className="text-[30px] font-extrabold tracking-display md:text-4xl">Suas receitas</h1>
        <p className="text-[15px] text-muted-foreground">
          As que a casa gosta, prontas para entrar na semana.
        </p>
      </div>
      <RecipesSection
        recipes={recipesPage.recipes}
        isPro={isPro}
        currentCount={recipeCount}
        query={query}
        filter={filter}
        page={recipesPage.page}
        hasNextPage={recipesPage.hasNextPage}
        canUseAi={access.canUseAi}
        trialAvailable={!access.isPro && !access.profile?.trialStartedAt}
        weekRecipeIds={meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []))}
        credits={credits}
        hasRecentPreviews={previews > 0}
        openBring={single(params.trazer) === "1"}
      />
      {recipeCount < 6 && !query && !filter && (
        <StarterCollection isPro={isPro} currentCount={recipeCount} />
      )}
    </main>
  );
}
