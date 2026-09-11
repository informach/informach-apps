import { notFound } from "next/navigation";
import { z } from "zod";
import { getIsProForUser } from "@/features/billing/server-cache";
import { getKitchenAccess } from "@/features/kitchen/access";
import { CookingView } from "@/features/kitchen/components/cooking-view";
import { getCookingSession } from "@/features/kitchen/repository";
import { RefineRecipeDialog } from "@/features/recipes/components/refine-recipe-dialog";
import { countRecipesByUser, findRecipeByIdForUser } from "@/features/recipes/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Preparar receita | Cozya",
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
  const [recipe, session, isPro] = await Promise.all([
    findRecipeByIdForUser(user.id, id),
    getCookingSession(user.id, id),
    getIsProForUser(user.id),
  ]);
  if (!recipe) notFound();
  const [access, recipeCount] = await Promise.all([
    getKitchenAccess(user.id),
    countRecipesByUser(user.id),
  ]);
  const currentSession =
    session?.recipeVersion.getTime() === recipe.contentUpdatedAt.getTime() ? session : null;
  const requestedServings = z.coerce.number().int().min(1).max(100).safeParse(query.porcoes).data;
  const servings = requestedServings ?? currentSession?.servings ?? recipe.servings ?? 2;
  const visibleSession =
    currentSession && currentSession.servings !== servings
      ? { ...currentSession, checkedIngredients: [] }
      : currentSession;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <CookingView
        key={`${recipe.id}:${recipe.contentUpdatedAt.toISOString()}:${requestedServings ?? "saved"}`}
        recipe={recipe}
        initialSession={visibleSession}
        initialServings={servings}
        isPro={isPro}
        adaptation={
          <RefineRecipeDialog
            recipe={recipe}
            canUseAi={access.canUseAi}
            isPro={isPro}
            currentCount={recipeCount}
          />
        }
      />
    </main>
  );
}
