"use client";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Pencil,
  Plus,
  Printer,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { parseIngredients, scaleIngredient } from "@/features/kitchen/ingredients";
import { keyedLines } from "@/features/kitchen/list-keys";
import { toggleRecipeFavoriteAction } from "../actions";
import { buildWhatsappShareUrl } from "../share";
import type { Recipe } from "../types";
import { catchActionResult } from "./action-errors";
import { DeleteRecipeDialog } from "./delete-recipe-dialog";
import { RecipeCover } from "./recipe-cover";
import { RecipeFormDialog } from "./recipe-form-dialog";

/** One page per recipe: read it, choose the portions, then cook. */
export function RecipeOverview({
  recipe,
  note,
  initialServings,
  isPro,
  currentCount,
  adaptation,
}: {
  recipe: Recipe;
  note: string | null;
  initialServings: number;
  isPro: boolean;
  currentCount: number;
  adaptation: ReactNode;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [servings, setServings] = useState(initialServings);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favorite, setFavorite] = useState(recipe.isFavorite);
  const [pending, startTransition] = useTransition();
  const ingredients = parseIngredients(recipe.ingredients);
  const steps = recipe.preparation
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
  const meta = [
    recipe.servings ? `A receita rende ${recipe.servings}` : "Rendimento ainda não informado",
    recipe.totalMinutes ? `${recipe.totalMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <Link
          href="/receitas"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold underline-offset-4 hover:underline print:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Suas receitas
        </Link>
        <RecipeCover
          name={recipe.name}
          className="h-28 rounded-3xl print:hidden [&_span]:text-[5.5rem]"
        />
        <div className="space-y-2">
          <h1 className="text-[34px] font-extrabold leading-[1.02] tracking-display md:text-5xl">
            {recipe.name}
          </h1>
          <p className="text-[15px] text-muted-foreground">{meta}</p>
          {recipe.sourceName && !recipe.sourceUrl && (
            <p className="text-sm text-muted-foreground">{recipe.sourceName}</p>
          )}
          {recipe.sourceUrl && (
            <p className="text-sm">
              Fonte:{" "}
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {recipe.sourceName || new URL(recipe.sourceUrl).hostname}
              </a>
            </p>
          )}
          {recipe.creationMethod !== "manual" && (
            <p className="text-sm text-muted-foreground">
              Organizada com IA. Confira medidas e preparo com a fonte antes de cozinhar.
            </p>
          )}
        </div>
        {note && (
          <div className="space-y-1 rounded-2xl bg-card p-4 ring-1 ring-border">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
              Sua nota da última vez
            </p>
            <p>“{note}”</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted p-3 print:hidden">
          <span className="pl-1 font-bold">Quantas porções?</span>
          <fieldset className="inline-flex items-center rounded-xl border bg-card">
            <legend className="sr-only">Porções</legend>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-l-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/50"
              aria-label="Menos uma porção"
              disabled={!hydrated || servings <= 1}
              onClick={() => setServings((value) => value - 1)}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <output
              aria-live="polite"
              aria-label="Porções"
              className="min-w-8 text-center text-[17px] font-extrabold"
            >
              {servings}
            </output>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-r-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/50"
              aria-label="Mais uma porção"
              disabled={!hydrated || servings >= 100}
              onClick={() => setServings((value) => value + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </fieldset>
        </div>
        <Button asChild className="h-14 w-full rounded-2xl text-[17px] font-extrabold print:hidden">
          <Link href={`/receitas/${recipe.id}/cozinhar?porcoes=${servings}`}>
            Começar a cozinhar
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="outline"
            className="min-h-11 rounded-xl bg-card"
            aria-pressed={favorite}
            disabled={!hydrated || pending}
            onClick={() =>
              startTransition(async () => {
                const next = !favorite;
                setFavorite(next);
                const result = await catchActionResult(() =>
                  toggleRecipeFavoriteAction({ id: recipe.id, isFavorite: next }),
                );
                if (!result.ok) {
                  setFavorite(!next);
                  toast.error("Não foi possível marcar como favorita.");
                }
              })
            }
          >
            <Star
              className={favorite ? "size-4 fill-current text-brand-ink" : "size-4"}
              aria-hidden
            />
            {favorite ? "Favorita" : "Favoritar"}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 rounded-xl bg-card"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl bg-card">
            <a href={buildWhatsappShareUrl(recipe)} target="_blank" rel="noopener noreferrer">
              <Send className="size-4" aria-hidden />
              Compartilhar no WhatsApp
            </a>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 rounded-xl bg-card"
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden />
            Imprimir
          </Button>
          {adaptation}
          <Button
            variant="ghost"
            className="min-h-11 rounded-xl text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            Apagar
          </Button>
        </div>
      </header>

      <section aria-labelledby="ingredientes" className="space-y-3">
        <h2 id="ingredientes" className="text-xl font-extrabold">
          Ingredientes
          {recipe.servings && servings !== recipe.servings ? (
            <span className="ml-2 text-sm font-bold text-muted-foreground">
              para {servings} {servings === 1 ? "porção" : "porções"}
            </span>
          ) : null}
        </h2>
        <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
          {keyedLines(ingredients, (item) => item.original).map(({ item, key }) => (
            <li key={key} className="px-4 py-3 text-[17px] leading-relaxed">
              {scaleIngredient(item, recipe.servings ?? null, servings)}
            </li>
          ))}
        </ul>
        {!recipe.servings && (
          <p className="text-sm text-muted-foreground">
            Sem o rendimento, as quantidades ficam como estão. Informe quanto a receita rende em
            Editar.
          </p>
        )}
        {recipe.servings && servings !== recipe.servings && (
          <p className="text-sm text-muted-foreground">
            Tempo, temperatura e o que é "a gosto" não mudam com as porções: confira na hora.
          </p>
        )}
      </section>

      <section aria-labelledby="preparo" className="space-y-3">
        <h2 id="preparo" className="text-xl font-extrabold">
          Modo de preparo
        </h2>
        <ol className="space-y-3">
          {keyedLines(steps, (step) => step).map(({ item: step, key }, index) => (
            <li key={key} className="flex gap-4 rounded-2xl bg-card p-4 ring-1 ring-border">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-extrabold">
                {index + 1}
              </span>
              <span className="text-[17px] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.finishing && (
        <section aria-labelledby="finalizar" className="space-y-2">
          <h2 id="finalizar" className="text-xl font-extrabold">
            Para finalizar
          </h2>
          <p className="whitespace-pre-line text-[17px] leading-relaxed">{recipe.finishing}</p>
        </section>
      )}

      {editing && (
        <RecipeFormDialog
          open
          onOpenChange={setEditing}
          recipe={recipe}
          isPro={isPro}
          currentCount={currentCount}
          onSaved={() => router.refresh()}
        />
      )}
      {deleting && (
        <DeleteRecipeDialog
          open
          onOpenChange={setDeleting}
          recipeId={recipe.id}
          recipeName={recipe.name}
          onDeleted={() => router.push("/receitas")}
        />
      )}
    </article>
  );
}
