"use client";
import { Button } from "@informach/ui/components/button";
import { useState } from "react";
import { RecipeFormDialog } from "@/features/recipes/components/recipe-form-dialog";
import type { RecipeFormValues } from "@/features/recipes/schemas";
import { STARTER_RECIPES } from "../starter-recipes";

export function StarterCollection({
  isPro,
  currentCount,
}: {
  isPro: boolean;
  currentCount: number;
}) {
  const [selected, setSelected] = useState<RecipeFormValues | null>(null);
  return (
    <section className="space-y-4 rounded-3xl bg-muted p-5">
      <div>
        <h2 className="text-xl font-extrabold">Da coleção do Cozya</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rascunhos autorais para conferir, ajustar e guardar sem gastar crédito. Ainda sem teste em
          cozinha.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {STARTER_RECIPES.map((recipe) => (
          <div
            key={recipe.name}
            className="flex flex-col items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-border"
          >
            <h3 className="font-bold">{recipe.name}</h3>
            <p className="text-sm text-muted-foreground">Rende {recipe.servings}</p>
            <Button
              variant="outline"
              className="mt-auto min-h-11"
              onClick={() => setSelected(recipe)}
              aria-label={`Conferir ${recipe.name}`}
            >
              Conferir e guardar
            </Button>
          </div>
        ))}
      </div>
      {selected && (
        <RecipeFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onSaved={() => setSelected(null)}
          defaultValues={selected}
          isPro={isPro}
          currentCount={currentCount}
          title="Confira antes de guardar"
          description="Confira ingredientes, medidas e preparo. Você pode adaptar o rascunho à sua rotina."
        />
      )}
    </section>
  );
}
