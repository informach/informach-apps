"use client";
import { Button } from "@informach/ui/components/button";
import { Checkbox } from "@informach/ui/components/checkbox";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type { z } from "zod";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { RecipeFormDialog } from "@/features/recipes/components/recipe-form-dialog";
import { buildWhatsappShareUrl } from "@/features/recipes/share";
import type { Recipe } from "@/features/recipes/types";
import { cookingAction } from "../actions";
import { parseIngredients, scaleIngredient } from "../ingredients";
import { keyedLines } from "../list-keys";
import type { cookingInputSchema } from "../schemas";
import type { CookingSession as Session } from "../types";
import { useCookingTimer, useScreenAwake } from "./use-cooking-tools";

export function CookingView({
  recipe,
  initialSession,
  initialServings,
  isPro,
  adaptation,
}: {
  recipe: Recipe;
  initialSession: Session | null;
  initialServings: number;
  isPro: boolean;
  adaptation?: ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [servings, setServings] = useState(initialServings);
  const [servingsDraft, setServingsDraft] = useState(String(initialServings));
  const [minutes, setMinutes] = useState(10);
  const [awake, setAwake] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const wakeStatus = useScreenAwake(awake);
  const timer = useCookingTimer(session?.timerEndsAt ?? null);
  const ingredients = recipe.structuredIngredients ?? parseIngredients(recipe.ingredients);
  const steps = recipe.preparation
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
  const save = (
    operation: z.infer<typeof cookingInputSchema>["operation"],
    nextServings = servings,
  ) =>
    startTransition(async () => {
      const result = await catchActionResult(() =>
        cookingAction({ recipeId: recipe.id, servings: nextServings, operation }),
      );
      if (!result.ok) toast.error("Não foi possível salvar seu progresso. Tente novamente.");
      else {
        setSession(result.value);
        setServings(result.value.servings ?? nextServings);
        if (operation.type === "portions") {
          setServingsDraft(String(nextServings));
          router.replace(`/receitas/${recipe.id}`, { scroll: false });
          toast.success("Porções salvas. Confira novamente os ingredientes.");
        }
        if (operation.type === "complete")
          toast.success("Receita preparada! Ela fica pronta para repetir na próxima semana.");
      }
    });
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          ← Minhas receitas
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{recipe.name}</h1>
        <p className="text-sm text-muted-foreground">
          {recipe.servings
            ? `Rendimento original: ${recipe.servings} porções`
            : "Rendimento original ainda não informado"}
          {recipe.totalMinutes ? ` · ${recipe.totalMinutes} minutos` : ""}
        </p>
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
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
            Editar receita
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <a href={buildWhatsappShareUrl(recipe)} target="_blank" rel="noopener noreferrer">
              Compartilhar no WhatsApp
            </a>
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => window.print()}>
            Imprimir
          </Button>
          {adaptation}
        </div>
      </header>
      <div className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-5 sm:grid-cols-2">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = Number(servingsDraft);
            if (Number.isInteger(next) && next >= 1 && next <= 100)
              save({ type: "portions" }, next);
          }}
        >
          <Label htmlFor="cooking-servings">Porções de hoje</Label>
          <Input
            id="cooking-servings"
            type="number"
            min={1}
            max={100}
            className="max-w-32"
            value={servingsDraft}
            required
            disabled={pending}
            onChange={(event) => setServingsDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-11 print:hidden"
            disabled={pending || Number(servingsDraft) === servings}
          >
            Aplicar porções
          </Button>
          <p className="text-xs text-muted-foreground">
            Ao aplicar, as porções ficam salvas e as marcações de ingredientes recomeçam.
          </p>
          {!recipe.servings && (
            <p className="text-sm text-muted-foreground">
              Informe o rendimento em “Editar receita” para ajustar quantidades. Por enquanto, os
              valores originais são mantidos.
            </p>
          )}
        </form>
        <div className="space-y-2 print:hidden">
          <Button
            variant={awake ? "secondary" : "outline"}
            aria-pressed={awake}
            className="min-h-11"
            onClick={() => setAwake(!awake)}
          >
            {awake ? "Liberar tela" : "Manter tela ligada"}
          </Button>
          <p className="text-xs text-muted-foreground" role="status">
            {wakeStatus}
          </p>
          <p className="text-xs text-muted-foreground">
            Seu progresso é salvo na conta a cada marcação.
          </p>
        </div>
      </div>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Separe os ingredientes</h2>
        <ul className="divide-y rounded-2xl border border-border">
          {keyedLines(ingredients, (ingredient) => ingredient.original).map(
            ({ item: ingredient, key }, index) => {
              const checked = session?.checkedIngredients.includes(index) ?? false;
              return (
                <li key={key}>
                  <label
                    htmlFor={`cooking-ingredient-${index}`}
                    className={`flex min-h-14 cursor-pointer items-center gap-4 px-5 py-4 text-lg leading-relaxed ${checked ? "text-muted-foreground line-through" : ""}`}
                  >
                    <Checkbox
                      id={`cooking-ingredient-${index}`}
                      checked={checked}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        save({ type: "ingredient", index, checked: value === true })
                      }
                      className="size-5 shrink-0 border-[var(--cozya-accent-ink)]"
                    />
                    <span>{scaleIngredient(ingredient, recipe.servings ?? null, servings)}</span>
                  </label>
                </li>
              );
            },
          )}
        </ul>
        <p className="text-xs text-muted-foreground">
          Ajustes de porção multiplicam ingredientes numéricos. Tempo, temperatura e itens “a gosto”
          precisam de conferência.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Hora de preparar</h2>
        <ol className="space-y-3">
          {keyedLines(steps, (step) => step).map(({ item: step, key }, index) => {
            const checked = session?.completedSteps.includes(index) ?? false;
            return (
              <li key={key} className="rounded-2xl border border-border">
                <label
                  htmlFor={`cooking-step-${index}`}
                  className={`flex cursor-pointer items-start gap-4 p-5 text-lg leading-relaxed ${checked ? "text-muted-foreground" : ""}`}
                >
                  <Checkbox
                    id={`cooking-step-${index}`}
                    checked={checked}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      save({ type: "step", index, checked: value === true })
                    }
                    className="mt-1.5 size-5 shrink-0 border-[var(--cozya-accent-ink)]"
                  />
                  <span>
                    <span className="mb-1 block text-sm font-semibold text-muted-foreground">
                      Passo {index + 1}
                    </span>
                    {step}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </section>
      {recipe.finishing && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Para finalizar</h2>
          <p className="whitespace-pre-line text-lg leading-relaxed">{recipe.finishing}</p>
        </section>
      )}
      <section className="space-y-3 rounded-2xl border p-5 print:hidden" aria-label="Temporizador">
        <h2 className="text-xl font-semibold">Tempo de panela</h2>
        {session?.timerEndsAt ? (
          <>
            <p
              role="timer"
              className="text-4xl font-semibold tabular-nums"
              aria-label="Tempo restante"
            >
              {timer.display}
            </p>
            <p role="status">
              {timer.expired
                ? "O tempo terminou. Confira seu preparo."
                : "Temporizador em andamento."}
            </p>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => save({ type: "timer", minutes: 0 })}
            >
              Limpar temporizador
            </Button>
          </>
        ) : (
          <form
            className="flex items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save({ type: "timer", minutes });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="timer-minutes">Minutos</Label>
              <Input
                id="timer-minutes"
                type="number"
                min={1}
                max={1440}
                required
                value={minutes}
                className="max-w-28"
                onChange={(event) => setMinutes(event.target.valueAsNumber)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              Iniciar
            </Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          O prazo fica salvo ao sair. Mantenha a página aberta para acompanhar; este temporizador
          não envia alarmes em segundo plano.
        </p>
      </section>
      <footer className="flex flex-wrap items-center gap-3 border-t py-6 print:hidden">
        <Button
          className="min-h-12"
          disabled={pending || !!session?.cookedAt}
          onClick={() => save({ type: "complete" })}
        >
          {session?.cookedAt ? "Você já preparou esta receita ✓" : "Cozinhei esta receita"}
        </Button>
        <Button
          variant="outline"
          className="min-h-12"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Começar um novo preparo e limpar as marcações atuais?"))
              save({ type: "reset" });
          }}
        >
          Começar novo preparo
        </Button>
        <Button asChild variant="ghost">
          <Link href="/semana">Planejar para repetir →</Link>
        </Button>
      </footer>
      {editing && (
        <RecipeFormDialog
          open
          onOpenChange={setEditing}
          recipe={recipe}
          isPro={isPro}
          currentCount={0}
        />
      )}
    </div>
  );
}
