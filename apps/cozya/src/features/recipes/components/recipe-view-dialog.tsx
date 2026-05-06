"use client";

import { Button } from "@informach/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@informach/ui/components/dialog";
import { Share2, Star } from "lucide-react";
import type { Recipe } from "../repository";
import { buildWhatsappShareUrl, parseIngredients } from "../share";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe;
};

export function RecipeViewDialog({ open, onOpenChange, recipe }: Props) {
  const ingredients = parseIngredients(recipe.ingredients);
  const ingredientItems = buildIngredientItems(ingredients);
  const finishing = recipe.finishing?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto rounded-2xl sm:max-w-lg">
        <Button asChild size="icon" className="absolute right-14 top-2 size-8 rounded-full">
          <a
            href={buildWhatsappShareUrl(recipe)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Compartilhar no WhatsApp"
          >
            <Share2 className="size-4" aria-hidden />
          </a>
        </Button>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-24 text-left text-xl font-semibold">
            {recipe.name}
            {recipe.isFavorite ? (
              <Star className="size-4 shrink-0 text-primary" fill="currentColor" aria-hidden />
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ingredientes
            </h3>
            {ingredients.length > 0 ? (
              <ul className="ml-5 list-disc space-y-1 text-foreground marker:text-muted-foreground">
                {ingredientItems.map((item) => (
                  <li key={item.key}>{item.line}</li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-line text-foreground">{recipe.ingredients}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preparo
            </h3>
            <p className="whitespace-pre-line text-foreground">{recipe.preparation}</p>
          </section>

          {finishing ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Finalização
              </h3>
              <p className="whitespace-pre-line text-foreground">{finishing}</p>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildIngredientItems(lines: string[]): Array<{ key: string; line: string }> {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    return { key: `${line}-${occurrence}`, line };
  });
}
