"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleRecipeFavoriteAction } from "../actions";
import { countIngredients } from "../share";
import type { Recipe } from "../types";
import { catchActionResult, isActionRejected } from "./action-errors";
import { DeleteRecipeDialog } from "./delete-recipe-dialog";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { RecipeViewDialog } from "./recipe-view-dialog";

type Props = {
  recipe: Recipe;
  isPro: boolean;
  currentCount: number;
};

const ingredientLabel = (count: number) =>
  `${count} ${count === 1 ? "ingrediente" : "ingredientes"}`;

export function RecipeCard({ recipe, isPro, currentCount }: Props) {
  const router = useRouter();
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [favPending, startFavTransition] = useTransition();

  const ingredientsCount = countIngredients(recipe.ingredients);

  const handleToggleFavorite = (event: React.MouseEvent) => {
    event.stopPropagation();
    const next = !recipe.isFavorite;
    startFavTransition(async () => {
      const result = await catchActionResult(() =>
        toggleRecipeFavoriteAction({ id: recipe.id, isFavorite: next }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível atualizar a favorita.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Receita não encontrada");
          router.refresh();
          return;
        }
        toast.error("Não foi possível atualizar a favorita.");
        return;
      }
      toast.success(next ? "Receita favoritada" : "Removida dos favoritos");
      router.refresh();
    });
  };

  return (
    <>
      <Card className="rounded-2xl border-border/60 transition-colors hover:border-border hover:shadow-sm">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <button
            type="button"
            onClick={() => setViewOpen(true)}
            className="flex-1 cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver detalhes de ${recipe.name}`}
          >
            <p className="text-base font-semibold leading-tight text-foreground">{recipe.name}</p>
            <p className="mt-1 text-sm text-primary">{ingredientLabel(ingredientsCount)}</p>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 rounded-full",
                recipe.isFavorite
                  ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={handleToggleFavorite}
              disabled={favPending}
              aria-label={recipe.isFavorite ? "Desfavoritar" : "Favoritar"}
              aria-pressed={recipe.isFavorite}
            >
              {favPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Star
                  className="size-4"
                  fill={recipe.isFavorite ? "currentColor" : "none"}
                  aria-hidden
                />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setEditOpen(true);
              }}
              aria-label="Editar receita"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteOpen(true);
              }}
              aria-label="Excluir receita"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>

      {viewOpen ? (
        <RecipeViewDialog open={viewOpen} onOpenChange={setViewOpen} recipe={recipe} />
      ) : null}
      {editOpen ? (
        <RecipeFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          isPro={isPro}
          currentCount={currentCount}
          recipe={recipe}
        />
      ) : null}
      {deleteOpen ? (
        <DeleteRecipeDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          recipeId={recipe.id}
          recipeName={recipe.name}
        />
      ) : null}
    </>
  );
}
