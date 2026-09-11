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
    <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border p-5">
      <div>
        <h2 className="text-xl font-semibold">Uma ideia para começar</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Receitas autorais para você revisar, ajustar e salvar sem gastar créditos. Esta coleção
          ainda não foi testada em cozinha.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {STARTER_RECIPES.map((recipe) => (
          <div
            key={recipe.name}
            className="flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-4"
          >
            <h3 className="font-medium">{recipe.name}</h3>
            <p className="text-sm text-muted-foreground">{recipe.servings} porções sugeridas</p>
            <Button
              variant="outline"
              className="mt-auto min-h-11"
              onClick={() => setSelected(recipe)}
              aria-label={`Revisar ${recipe.name}`}
            >
              Revisar e salvar
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
          title="Revise antes de guardar"
          description="Confira ingredientes, medidas e preparo. Você pode adaptar o rascunho à sua rotina."
        />
      )}
    </section>
  );
}
