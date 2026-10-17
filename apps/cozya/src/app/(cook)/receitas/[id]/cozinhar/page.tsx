import { notFound } from "next/navigation";
import { z } from "zod";
import { CookingMode } from "@/features/kitchen/components/cooking-mode";
import { localDay } from "@/features/kitchen/dates";
import { getCookingSession } from "@/features/kitchen/repository";
import { findRecipeByIdForUser } from "@/features/recipes/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Modo cozinha | Cozya",
  robots: { index: false, follow: false },
};

export default async function CookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ porcoes?: string; marmitas?: string; etapa?: string }>;
}) {
  const [user, { id }, query] = await Promise.all([requireUserServer(), params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [recipe, stored] = await Promise.all([
    findRecipeByIdForUser(user.id, id),
    getCookingSession(user.id, id),
  ]);
  if (!recipe) notFound();
  // Progress of another recipe version, or of a preparation finished on another day, is history.
  const current =
    stored &&
    stored.recipeVersion.getTime() === recipe.contentUpdatedAt.getTime() &&
    (!stored.cookedAt || localDay(stored.cookedAt) === localDay())
      ? stored
      : null;
  const requested = z.coerce.number().int().min(1).max(100).safeParse(query.porcoes).data;
  const lunchboxes = z.coerce.number().int().min(0).max(100).safeParse(query.marmitas).data ?? 0;
  const servings = requested ?? current?.servings ?? recipe.servings ?? 2;
  return (
    <CookingMode
      key={`${recipe.id}:${recipe.contentUpdatedAt.toISOString()}`}
      recipe={recipe}
      initialSession={
        current && current.servings !== servings ? { ...current, checkedIngredients: [] } : current
      }
      servings={servings}
      lunchboxes={Math.min(lunchboxes, servings)}
      note={stored?.note ?? null}
      verdict={stored?.verdict ?? null}
      startAtFeedback={query.etapa === "fim"}
    />
  );
}
