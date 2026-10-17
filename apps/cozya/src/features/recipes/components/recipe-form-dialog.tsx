"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { Switch } from "@informach/ui/components/switch";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { createRecipeAction, updateRecipeAction } from "../actions";
import { FREE_RECIPE_LIMIT } from "../limits";
import { type RecipeFormValues, recipeInputSchema } from "../schemas";
import type { Recipe } from "../types";
import { catchActionResult, isActionRejected } from "./action-errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPro: boolean;
  currentCount: number;
  recipe?: Recipe;
  defaultValues?: RecipeFormValues;
  title?: string;
  description?: string;
  onSaved?: () => void;
};

/** What the person checks the AI draft against, by where the recipe came from. */
const CHECK_AGAINST: Record<string, string> = {
  image: "a foto",
  text: "o texto",
  voice: "o que você contou",
  prompt: "a fonte",
};

const EMPTY_DEFAULTS: RecipeFormValues = {
  name: "",
  ingredients: "",
  preparation: "",
  finishing: "",
  isFavorite: false,
  creationMethod: "manual",
};

function defaultsFromRecipe(recipe: Recipe): RecipeFormValues {
  return {
    name: recipe.name,
    ingredients: recipe.ingredients,
    preparation: recipe.preparation,
    finishing: recipe.finishing ?? "",
    isFavorite: recipe.isFavorite,
    creationMethod: recipe.creationMethod,
    servings: recipe.servings ?? null,
    totalMinutes: recipe.totalMinutes ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    sourceName: recipe.sourceName ?? null,
  };
}

export function RecipeFormDialog({
  open,
  onOpenChange,
  isPro,
  currentCount,
  recipe,
  defaultValues,
  title,
  description,
  onSaved,
}: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = recipe !== undefined;
  const limitReached = !isEdit && !isPro && currentCount >= FREE_RECIPE_LIMIT;

  const initialDefaults = recipe
    ? defaultsFromRecipe(recipe)
    : { ...EMPTY_DEFAULTS, ...defaultValues };

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeInputSchema),
    defaultValues: initialDefaults,
  });

  useEffect(() => {
    if (open) {
      form.reset(recipe ? defaultsFromRecipe(recipe) : { ...EMPTY_DEFAULTS, ...defaultValues });
    }
  }, [open, recipe, defaultValues, form]);

  const isAiDraft =
    !isEdit && !!defaultValues?.creationMethod && defaultValues.creationMethod !== "manual";
  const watchedServings = form.watch("servings");
  // An AI draft never guesses the yield: it is answered before the recipe is kept.
  const needsYield = isAiDraft && (watchedServings === null || watchedServings === undefined);
  const watchedIngredients = form.watch("ingredients") ?? "";
  // "2 de farinha": a number with no measure. Never guessed; the person is asked to confirm.
  const unclearMeasures = watchedIngredients
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?\s+de\s+/i.test(line))
    .slice(0, 3);

  const hasUnsavedChanges = open && form.formState.isDirty;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      if (isEdit && recipe) {
        const result = await catchActionResult(() =>
          updateRecipeAction({ id: recipe.id, ...values }),
        );
        if (!result.ok) {
          if (isActionRejected(result.error)) {
            toast.error("Não foi possível salvar as alterações.", {
              description: "Atualize a página e tente novamente.",
            });
            router.refresh();
            return;
          }
          if (result.error.code === "NOT_FOUND") {
            toast.error("Receita não encontrada", {
              description: "Ela pode ter sido removida em outra aba.",
            });
            onOpenChange(false);
            router.refresh();
            return;
          }
          toast.error("Não foi possível salvar as alterações.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
        toast.success("Receita atualizada");
        onSaved?.();
        form.reset(values);
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await catchActionResult(() => createRecipeAction(values));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível salvar a receita.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "PLAN_LIMIT_REACHED") {
          toast.error(`O Free guarda até ${result.error.limit} receitas.`, {
            description: "Para guardar mais, assine o Pro. As que você já tem continuam aqui.",
            action: { label: "Conhecer o Pro", onClick: () => router.push("/upgrade") },
          });
          return;
        }
        toast.error("Não foi possível salvar a receita.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Receita guardada");
      form.reset(EMPTY_DEFAULTS);
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next && submitting) return;
    if (
      !next &&
      form.formState.isDirty &&
      !window.confirm("Descartar as alterações não salvas desta receita?")
    )
      return;
    if (!next) {
      form.reset(recipe ? defaultsFromRecipe(recipe) : { ...EMPTY_DEFAULTS, ...defaultValues });
    }
    onOpenChange(next);
  };

  const resolvedTitle = title ?? (isEdit ? "Editar receita" : "Escrever do meu jeito");
  const resolvedDescription =
    description ??
    (isEdit
      ? "Mudar ingredientes ou passos recomeça o preparo que estiver em andamento."
      : "Nome, ingredientes e passos. Sem crédito.");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        {limitReached ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-brand-ink">
                <Lock className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  O Free guarda até {FREE_RECIPE_LIMIT} receitas.
                </p>
                <p className="text-sm text-muted-foreground">
                  Para guardar mais, assine o Pro. As receitas que você já tem continuam aqui.
                </p>
              </div>
              <Button asChild>
                <Link href="/upgrade">Conhecer o Pro</Link>
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        placeholder="Ex.: Bolo de cenoura com cobertura de chocolate"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ingredients"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ingredientes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder={"Um ingrediente por linha\n200g de farinha\n3 ovos"}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Um por linha. As quantidades vão para a lista do mercado.
                    </FormDescription>
                    {unclearMeasures.length > 0 && (
                      <ul className="space-y-1 rounded-xl bg-peach p-3 text-sm text-peach-ink">
                        {unclearMeasures.map((line) => (
                          <li key={line}>
                            Confira a medida: “{line}” não diz se são xícaras, colheres ou gramas.
                          </li>
                        ))}
                      </ul>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {needsYield && (
                <fieldset className="space-y-2.5 rounded-2xl bg-peach p-3.5 text-peach-ink">
                  <legend className="float-left mb-2.5 w-full text-[15px] leading-snug font-bold">
                    A receita não diz quantas porções rende. Quantas são?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[2, 4, 6, 8, 12].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() =>
                          form.setValue("servings", count, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        className="min-h-11 min-w-12 rounded-full bg-card px-4 font-extrabold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {count}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => form.setFocus("servings")}
                      className="min-h-11 rounded-full bg-card px-4 font-extrabold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Outro
                    </button>
                  </div>
                  <p className="text-[13px] leading-snug">
                    Sem isso o Cozya não ajusta as quantidades nem soma na lista.
                  </p>
                </fieldset>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="servings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quanto rende (porções)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          placeholder="Não informado"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tempo total (min)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={10080}
                          placeholder="Opcional"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="preparation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de preparo</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder="Descreva o passo a passo da receita."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="finishing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Finalização{" "}
                      <span className="font-normal text-muted-foreground">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Cobertura, decoração, dicas finais…"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFavorite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Marcar como favorita</FormLabel>
                      <FormDescription className="text-xs">
                        Favoritas ficam destacadas na sua listagem.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sourceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link da fonte (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        maxLength={2048}
                        placeholder="https://…"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sourceName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Autor ou origem (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder="Ex.: caderno da família"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || needsYield}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  {isEdit
                    ? "Salvar alterações"
                    : isAiDraft
                      ? needsYield
                        ? "Responda o rendimento para guardar"
                        : "Guardar receita"
                      : "Salvar"}
                </Button>
              </DialogFooter>
              {isAiDraft && (
                <p className="text-center text-xs text-muted-foreground">
                  1 crédito usado. Organizada com IA: confira as medidas com{" "}
                  {CHECK_AGAINST[defaultValues?.creationMethod ?? ""] ?? "a fonte"}.
                </p>
              )}
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
