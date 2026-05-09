import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Heart, MessagesSquare, Sparkles } from "lucide-react";

type Recipe = {
  name: string;
  ingredients: string[];
  badge: { label: string; tone: "primary" | "muted" | "secondary" };
  favorite: boolean;
};

const FRONT_RECIPE: Recipe = {
  name: "Bolo de cenoura · vegana",
  ingredients: ["3 cenouras médias", "Linhaça hidratada", "1 xíc. óleo", "2 xíc. açúcar mascavo"],
  badge: { label: "Salva como favorita", tone: "primary" },
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
  badge: { label: "Por voz", tone: "secondary" },
  favorite: true,
};

function RecipeCard({ recipe, className }: { recipe: Recipe; className?: string }) {
  return (
    <Card className={`w-60 border-border/80 shadow-lg backdrop-blur-sm md:w-72 ${className ?? ""}`}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-2">
          {recipe.badge.tone === "primary" ? (
            <Badge className="gap-1">
              <Sparkles className="size-3" aria-hidden />
              {recipe.badge.label}
            </Badge>
          ) : recipe.badge.tone === "secondary" ? (
            <Badge variant="secondary" className="gap-1">
              <MessagesSquare className="size-3" aria-hidden />
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
    <div className="relative isolate flex min-h-[360px] items-center justify-center md:min-h-[420px]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-primary/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-10 top-10 -z-10 size-40 rounded-full bg-secondary/30 blur-3xl"
        aria-hidden
      />

      <div className="relative h-[360px] w-full max-w-md md:h-[420px]">
        <div
          className="absolute left-0 top-12 -rotate-6 transition-transform duration-500 hover:rotate-0 motion-safe:animate-float-soft md:top-16"
          style={{ animationDelay: "0.6s" }}
        >
          <RecipeCard recipe={LEFT_RECIPE} className="opacity-90" />
        </div>
        <div
          className="absolute right-0 top-1 rotate-6 transition-transform duration-500 hover:rotate-0 motion-safe:animate-float-soft md:top-2"
          style={{ animationDelay: "1.2s" }}
        >
          <RecipeCard recipe={RIGHT_RECIPE} className="opacity-90" />
        </div>
        <div
          className="absolute left-1/2 top-20 -translate-x-1/2 transition-transform duration-500 hover:-translate-y-1 motion-safe:animate-float-soft md:top-24"
          style={{ animationDelay: "0s" }}
        >
          <RecipeCard recipe={FRONT_RECIPE} />
        </div>
      </div>
    </div>
  );
}
