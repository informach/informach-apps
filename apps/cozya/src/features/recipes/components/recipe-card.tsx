import { Star } from "lucide-react";
import Link from "next/link";
import { cookedAgo } from "@/features/kitchen/dates";
import type { RecipeSummary } from "../types";
import { RecipeCover } from "./recipe-cover";

function lastCooked(recipe: RecipeSummary, now: Date) {
  if (recipe.verdict === "skip") return "Você disse que não repetiria";
  if (!recipe.lastCookedAt) return "Ainda não fez";
  const label = cookedAgo(recipe.lastCookedAt, now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** A card that opens the recipe page: the cover, the name, how long it takes, how much it makes. */
export function RecipeCard({
  recipe,
  inWeek,
  now,
}: {
  recipe: RecipeSummary;
  inWeek: boolean;
  now: Date;
}) {
  const meta = [
    recipe.totalMinutes ? `${recipe.totalMinutes} min` : null,
    recipe.servings ? `rende ${recipe.servings}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/receitas/${recipe.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-[18px] bg-card ring-1 ring-border outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <RecipeCover name={recipe.name} className="h-[104px]" />
        {recipe.isFavorite && (
          <span className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-card/90 text-brand-ink">
            <Star className="size-4 fill-current" aria-label="Favorita" />
          </span>
        )}
        {inWeek && (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-extrabold tracking-[0.06em] text-secondary-foreground">
            NA SEMANA
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="font-bold leading-snug">{recipe.name}</span>
        {meta && <span className="text-[13px] text-muted-foreground">{meta}</span>}
        <span className="mt-auto pt-1 text-[13px] text-muted-foreground">
          {lastCooked(recipe, now)}
        </span>
      </div>
    </Link>
  );
}
