import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Heart, Sparkles } from "lucide-react";

type Recipe = {
  name: string;
  ingredients: string[];
  badge: { label: string; tone: "primary" | "muted" };
  favorite: boolean;
};

const FRONT_RECIPE: Recipe = {
  name: "Bolo de cenoura fofinho",
  ingredients: ["3 cenouras médias", "3 ovos", "1 xíc. óleo", "2 xíc. açúcar"],
  badge: { label: "Gerada por IA", tone: "primary" },
  favorite: true,
};

const LEFT_RECIPE: Recipe = {
  name: "Frango ao limão",
  ingredients: ["4 filés", "Suco de 2 limões", "Alho", "Salsinha"],
  badge: { label: "Importada de foto", tone: "muted" },
  favorite: false,
};

const RIGHT_RECIPE: Recipe = {
  name: "Brigadeiro de colher",
  ingredients: ["1 lata leite cond.", "3 colh. cacau", "Manteiga"],
  badge: { label: "Manual", tone: "muted" },
  favorite: true,
};

function RecipeCard({ recipe, className }: { recipe: Recipe; className?: string }) {
  return (
    <Card className={`w-72 border-border/80 shadow-lg backdrop-blur-sm ${className ?? ""}`}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-2">
          {recipe.badge.tone === "primary" ? (
            <Badge className="gap-1">
              <Sparkles className="size-3" aria-hidden />
              {recipe.badge.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-medium">
              {recipe.badge.label}
            </Badge>
          )}
          <p className="text-base font-semibold leading-tight tracking-tight">{recipe.name}</p>
        </div>
        <Heart
          className={`size-4 shrink-0 ${
            recipe.favorite ? "fill-primary text-primary" : "text-muted-foreground/60"
          }`}
          aria-hidden
        />
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {recipe.ingredients.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-primary/70" />
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function HeroRecipeCards() {
  return (
    <div className="relative isolate flex h-full min-h-[420px] items-center justify-center">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-primary/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-10 top-10 -z-10 size-40 rounded-full bg-secondary/30 blur-3xl"
        aria-hidden
      />

      <div className="relative h-[420px] w-full max-w-md">
        <div className="absolute left-0 top-16 -rotate-6 transition-transform duration-500 hover:rotate-0">
          <RecipeCard recipe={LEFT_RECIPE} className="opacity-90" />
        </div>
        <div className="absolute right-0 top-2 rotate-6 transition-transform duration-500 hover:rotate-0">
          <RecipeCard recipe={RIGHT_RECIPE} className="opacity-90" />
        </div>
        <div className="absolute left-1/2 top-24 -translate-x-1/2 transition-transform duration-500 hover:-translate-y-1">
          <RecipeCard recipe={FRONT_RECIPE} />
        </div>
      </div>
    </div>
  );
}
