import { Star } from "lucide-react";
import Link from "next/link";
import { recipePhoto } from "../photos";
import type { RecipeSummary } from "../types";
import { RecipeCover } from "./recipe-cover";

/** A card that opens the recipe page: the cover, the name, how long it takes, how much it makes. */
export function RecipeCard({ recipe, inWeek }: { recipe: RecipeSummary; inWeek: boolean }) {
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
        <RecipeCover
          name={recipe.name}
          photo={recipePhoto(recipe)}
          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 240px"
          className="h-[104px]"
        />
        {recipe.isFavorite && (
          <span className="absolute top-2.5 right-2.5 flex size-[30px] items-center justify-center rounded-full bg-card/90 text-brand-ink">
            <Star className="size-[15px] fill-current" aria-label="Favorita" />
          </span>
        )}
        {inWeek && (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-secondary px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-secondary-foreground">
            NA SEMANA
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-[3px] px-3 pt-2.5 pb-3">
        <span className="text-[15px] font-bold leading-tight">{recipe.name}</span>
        {meta && <span className="text-[13px] text-muted-foreground">{meta}</span>}
      </div>
    </Link>
  );
}
