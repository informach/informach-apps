import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { ChefHat, Star } from "lucide-react";
import type { Recipe } from "../repository";

type Props = {
  recipes: Recipe[];
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function summarizeIngredients(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" • ");
}

export function RecipesGrid({ recipes }: Props) {
  if (recipes.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ChefHat className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Nenhuma receita ainda</p>
            <p className="text-sm text-muted-foreground">
              Clique em <span className="font-medium text-foreground">Nova receita</span> para
              começar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <Card key={recipe.id} className="border-border/60">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-base font-semibold leading-tight">{recipe.name}</CardTitle>
            {recipe.isFavorite ? (
              <Star
                className="size-4 shrink-0 text-primary"
                fill="currentColor"
                aria-label="Favorita"
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {summarizeIngredients(recipe.ingredients) || "Sem ingredientes listados."}
            </p>
            <p className="text-xs text-muted-foreground">
              {dateFormatter.format(new Date(recipe.createdAt))}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
