import { notFound } from "next/navigation";
import { z } from "zod";
import { getIsProForUser } from "@/features/billing/server-cache";
import { getKitchenAccess } from "@/features/kitchen/access";
import { cookedAgo } from "@/features/kitchen/dates";
import { getCookingSession } from "@/features/kitchen/repository";
import { RecipeOverview } from "@/features/recipes/components/recipe-overview";
import { RefineRecipeDialog } from "@/features/recipes/components/refine-recipe-dialog";
import { countRecipesByUser, findRecipeByIdForUser } from "@/features/recipes/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Receita | Cozya",
  robots: { index: false, follow: false },
};

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ porcoes?: string }>;
}) {
  const [user, { id }, query] = await Promise.all([requireUserServer(), params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [recipe, session, isPro, access, recipeCount] = await Promise.all([
    findRecipeByIdForUser(user.id, id),
    getCookingSession(user.id, id),
    getIsProForUser(user.id),
    getKitchenAccess(user.id),
    countRecipesByUser(user.id),
  ]);
  if (!recipe) notFound();
  const requested = z.coerce.number().int().min(1).max(100).safeParse(query.porcoes).data;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <RecipeOverview
        key={`${recipe.id}:${recipe.updatedAt.toISOString()}`}
        recipe={recipe}
        note={session?.note ?? null}
        cooked={
          session?.verdict === "skip"
            ? "você disse que não repetiria"
            : session?.lastCookedAt
              ? cookedAgo(session.lastCookedAt)
              : "ainda não fez"
        }
        initialServings={requested ?? recipe.servings ?? access.profile?.householdSize ?? 2}
        isPro={isPro}
        currentCount={recipeCount}
        adaptation={
          <RefineRecipeDialog
            recipe={recipe}
            canUseAi={access.canUseAi}
            trialAvailable={!access.isPro && !access.profile?.trialStartedAt}
            isPro={isPro}
            currentCount={recipeCount}
          />
        }
      />
    </main>
  );
}
