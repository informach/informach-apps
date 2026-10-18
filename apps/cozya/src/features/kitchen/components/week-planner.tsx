"use client";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Minus, Plus, Repeat2, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { LunchboxIcon } from "@/components/brand/lunchbox-icon";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import {
  generateShoppingAction,
  removeMealAction,
  repeatWeekAction,
  saveMealAction,
} from "../actions";
import { addDays, longDayLabel, weekdayName, weekdayShort } from "../dates";
import { lunchboxesFor } from "../lunchbox";
import {
  byFavoriteAndTime,
  choiceMeta,
  matchesSearch,
  type RecipeChoice,
  suggestionsFor,
} from "../recipe-choices";
import { TRIAL_DAYS } from "../trial";
import type { Meal } from "../types";
import { FirstWeekSteps } from "./first-week-steps";
import { WeekNavigation } from "./week-navigation";

type Slot = "lunch" | "dinner";
const SLOT: Record<Slot, string> = { lunch: "Almoço", dinner: "Jantar" };
const FREE_MEALS = ["Sobras", "Comer fora", "Pedir comida"] as const;

type Editor = {
  day: string;
  slot: Slot;
  existingId: string | null;
  mode: "recipe" | "free";
  recipeId: string | null;
  free: string;
  other: string;
  table: number;
  lunchbox: number;
};

/** "na quinta", "no sábado" */
function onDay(day: string) {
  const name = weekdayName(day);
  return `${name === "sábado" || name === "domingo" ? "no" : "na"} ${name}`;
}

/** "a quinta", "o domingo" */
function theDay(day: string) {
  const name = weekdayName(day);
  return `${name === "sábado" || name === "domingo" ? "o" : "a"} ${name}`;
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  tone,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  tone?: "peach";
}) {
  return (
    <fieldset
      className={cn(
        "inline-flex items-center rounded-xl border bg-card",
        tone === "peach" && "border-peach-line bg-peach",
      )}
    >
      <legend className="sr-only">{label}</legend>
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-l-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/50"
        aria-label={`Menos em ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output
        aria-live="polite"
        aria-label={label}
        className="min-w-[26px] text-center text-[17px] font-extrabold"
      >
        {value}
      </output>
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-r-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/50"
        aria-label={`Mais em ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </fieldset>
  );
}

const CELL =
  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11 md:min-h-28 md:flex-col md:items-start md:gap-1.5 md:rounded-2xl md:p-3";
const CELL_LABEL =
  "w-14 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.06em] md:w-auto md:tracking-[0.08em]";
const EMPTY_CELL =
  "flex items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-input text-sm font-bold text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function WeekPlanner({
  week,
  today,
  meals,
  recipes,
  canPlan,
  trialAvailable,
  householdSize,
  initialEdit,
  list,
  shopping,
  firstWeek,
  carryOver,
}: {
  week: string;
  today: string;
  meals: Meal[];
  recipes: RecipeChoice[];
  canPlan: boolean;
  /** No trial yet: the first saved meal opens the 14 days on its own. */
  trialAvailable: boolean;
  householdSize: number;
  initialEdit: { day: string; slot: Slot } | null;
  list: "none" | "fresh" | "stale";
  /** What the list of this week holds from the planned meals: items to buy and the pantry. */
  shopping: { items: number; pantry: string[] };
  /** Arrived from the first week: step 2 of 3. */
  firstWeek: boolean;
  /** The meals of the Sunday before this week that set lunchboxes aside: Monday's lunch. */
  carryOver: Meal[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const now = useMemo(() => new Date(), []);
  const canEdit = canPlan || trialAvailable;
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const blank = (day: string, slot: Slot): Editor => ({
    day,
    slot,
    existingId: null,
    mode: "recipe",
    recipeId: null,
    free: "Sobras",
    other: "",
    table: householdSize,
    lunchbox: 0,
  });
  const fromMeal = (meal: Meal): Editor => {
    const known = (FREE_MEALS as readonly string[]).includes(meal.label);
    return {
      day: meal.day,
      slot: meal.slot,
      existingId: meal.id,
      mode: meal.recipeId ? "recipe" : "free",
      recipeId: meal.recipeId,
      free: meal.recipeId ? "Sobras" : known ? meal.label : "Outra coisa",
      other: meal.recipeId || known ? "" : meal.label,
      table: meal.servings - meal.lunchboxServings,
      lunchbox: meal.lunchboxServings,
    };
  };
  const editorFor = (day: string, slot: Slot) => {
    const meal = meals.find((entry) => entry.day === day && entry.slot === slot);
    return meal ? fromMeal(meal) : blank(day, slot);
  };
  const [editor, setEditor] = useState<Editor | null>(() =>
    initialEdit && canEdit ? editorFor(initialEdit.day, initialEdit.slot) : null,
  );
  const startEdit = (day: string, slot: Slot, recipeId?: string) => {
    setDirty(!!recipeId);
    setSearch("");
    const next = editorFor(day, slot);
    setEditor(recipeId ? { ...next, mode: "recipe", recipeId } : next);
  };
  const change = (value: Partial<Editor>) => {
    setEditor((previous) => (previous ? { ...previous, ...value } : null));
    setDirty(true);
  };
  const close = () => {
    if (!pending && (!dirty || window.confirm("Descartar as alterações desta refeição?"))) {
      setEditor(null);
      router.replace(`/semana?week=${week}`, { scroll: false });
    }
  };

  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const withRecipe = meals.filter((meal) => meal.recipeId).length;
  const free = meals.filter((meal) => !meal.recipeId).length;
  const openDays = days.filter((day) => day >= today && !meals.some((meal) => meal.day === day));
  const summary = [
    withRecipe ? `${withRecipe} ${withRecipe === 1 ? "refeição" : "refeições"} com receita` : null,
    free ? `${free} sem receita` : null,
    openDays.length
      ? `${openDays
          .map(weekdayName)
          .join(", ")
          .replace(/, ([^,]*)$/, " e $1")} em aberto`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const ranked = useMemo(() => [...recipes].sort(byFavoriteAndTime), [recipes]);
  const suggestions = useMemo(
    () =>
      suggestionsFor(
        recipes,
        new Set(meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []))),
        now,
      ),
    [recipes, meals, now],
  );
  const selected = recipes.find((recipe) => recipe.id === editor?.recipeId) ?? null;
  const query = search.trim();
  const visible = query ? ranked.filter((recipe) => matchesSearch(recipe, query)) : ranked;
  const total = editor ? editor.table + editor.lunchbox : 0;
  const portionsHint = (() => {
    if (editor?.mode !== "recipe") return "";
    const parts = [
      `${editor.table} + ${editor.lunchbox} = ${total} ${total === 1 ? "porção" : "porções"}.`,
    ];
    if (selected?.servings)
      parts.push(
        selected.servings === total
          ? `A receita rende ${selected.servings}, fica certinho.`
          : `A receita rende ${selected.servings}; o Cozya ajusta as quantidades para ${total}.`,
      );
    else if (selected)
      parts.push("A receita não diz quanto rende; as quantidades ficam como estão.");
    if (editor.lunchbox > 0)
      parts.push(`A marmita aparece no almoço de ${weekdayName(addDays(editor.day, 1))}.`);
    return parts.join(" ");
  })();
  const freeLabel = editor
    ? editor.free === "Outra coisa"
      ? editor.other.trim()
      : editor.free
    : "";
  const canSave =
    !!editor && (editor.mode === "recipe" ? !!editor.recipeId && total >= 1 : freeLabel.length > 0);

  const save = () => {
    if (!editor || !canSave) return;
    startTransition(async () => {
      const result = await catchActionResult(() =>
        saveMealAction({
          day: editor.day,
          slot: editor.slot,
          recipeId: editor.mode === "recipe" ? editor.recipeId : null,
          label: editor.mode === "recipe" ? "" : freeLabel,
          servings: editor.mode === "recipe" ? total : Math.max(1, editor.table),
          lunchboxServings: editor.mode === "recipe" ? editor.lunchbox : 0,
        }),
      );
      if (!result.ok) {
        const code: string = result.error.code;
        toast.error(
          ["TRIAL_ALREADY_USED", "TRIAL_EXPIRED", "SUBSCRIPTION_REQUIRED"].includes(code)
            ? "Para colocar receitas na semana, assine o Pro."
            : "Não foi possível salvar. Confira os campos e tente de novo.",
        );
        return;
      }
      toast.success(`${SLOT[editor.slot]} de ${weekdayName(editor.day)} planejado.`);
      setDirty(false);
      setEditor(null);
      router.replace(`/semana?week=${week}`, { scroll: false });
    });
  };

  const remove = () => {
    if (!editor?.existingId) return;
    const id = editor.existingId;
    startTransition(async () => {
      const result = await catchActionResult(() => removeMealAction({ id }));
      if (!result.ok) toast.error("Não foi possível tirar a refeição.");
      else {
        setDirty(false);
        setEditor(null);
        router.replace(`/semana?week=${week}`, { scroll: false });
      }
    });
  };

  const repeat = () =>
    startTransition(async () => {
      const result = await catchActionResult(() => repeatWeekAction({ week }));
      if (!result.ok) toast.error("Não foi possível repetir a semana.");
      else
        toast.success(
          result.value
            ? `${result.value} ${result.value === 1 ? "refeição copiada" : "refeições copiadas"} para os dias livres. O que já estava planejado ficou como estava.`
            : "Nada para copiar: a semana passada não tinha refeições nos dias livres.",
        );
    });

  const disabled = !hydrated || pending;
  const listPath = `/compras?week=${week}${firstWeek ? "&primeira=1" : ""}`;
  const openList = () =>
    // Without planning access the list that exists can still be opened, not rebuilt.
    list === "fresh" || !canPlan
      ? router.push(listPath)
      : startTransition(async () => {
          const result = await catchActionResult(() => generateShoppingAction({ week }));
          if (!result.ok) toast.error("Não foi possível montar a lista.");
          else router.push(listPath);
        });
  const listLabel = pending
    ? "Um instante…"
    : list === "fresh" || !canPlan
      ? "Abrir a lista do mercado"
      : list === "stale"
        ? "Atualizar a lista do mercado"
        : "Montar a lista do mercado";
  const itemsLabel = `${shopping.items} ${shopping.items === 1 ? "item" : "itens"}`;
  const listButton = (className: string) =>
    meals.length > 0 ? (
      <Button
        className={className}
        disabled={disabled || (!canPlan && list === "none")}
        onClick={openList}
      >
        {listLabel}{" "}
        {shopping.items > 0 && !pending && (
          <span className="rounded-full bg-primary-foreground/12 px-2 py-0.5 text-[13px] font-bold md:text-[13px]">
            {itemsLabel}
          </span>
        )}
      </Button>
    ) : null;
  const openDay = openDays[0] ?? null;
  const showSuggestions = canEdit && openDay !== null && suggestions.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {firstWeek && <FirstWeekSteps step={2} />}

      <div className="flex flex-col gap-3.5 md:flex-row md:items-end md:justify-between md:gap-6">
        <WeekNavigation week={week} path="/semana" detail={summary || undefined} />
        <div className="hidden shrink-0 gap-2.5 md:flex">
          {canPlan && (
            <Button
              variant="outline"
              className="min-h-12 rounded-[14px] border-[1.5px] border-input bg-transparent px-[18px] text-[15px] font-bold"
              disabled={disabled}
              onClick={repeat}
            >
              Repetir a semana passada
            </Button>
          )}
          {listButton("min-h-12 rounded-[14px] px-5 text-[15px] font-extrabold")}
        </div>
      </div>
      {summary && <p className="text-[15px] leading-snug text-ink-soft md:hidden">{summary}.</p>}

      {!canEdit && (
        <div role="status" className="space-y-2 rounded-2xl bg-muted p-4">
          <p className="font-bold">Novas semanas ficam no Pro.</p>
          <p className="text-sm text-muted-foreground">
            As semanas que você montou continuam aqui. Para planejar novas, assine o Pro.
          </p>
          <Button asChild className="min-h-11">
            <Link href="/upgrade">Conhecer o Pro</Link>
          </Button>
        </div>
      )}
      {trialAvailable && (
        <p role="status" className="rounded-2xl bg-muted p-4 text-sm">
          Seus {TRIAL_DAYS} dias grátis começam quando a primeira receita entrar na semana. Sem
          cartão.
        </p>
      )}

      <ol className="divide-y divide-border md:grid md:grid-cols-7 md:gap-3 md:divide-y-0">
        {days.map((day) => {
          const isToday = day === today;
          const editable = canEdit && day >= today;
          const lunch = meals.find((meal) => meal.day === day && meal.slot === "lunch");
          const dinner = meals.find((meal) => meal.day === day && meal.slot === "dinner");
          // What the day before set aside, at lunch or at dinner, is this day's lunch.
          const lunchboxes = lunchboxesFor(day, day === week ? carryOver : meals);
          const empty = !lunch && lunchboxes.length === 0 && !dinner;
          const mealCell = (slot: Slot, meal: Meal) => {
            const table = meal.servings - meal.lunchboxServings;
            return (
              <button
                type="button"
                disabled={disabled || !canEdit}
                onClick={() => startEdit(day, slot)}
                aria-label={`${SLOT[slot]} de ${weekdayName(day)}: ${meal.label}. Trocar`}
                className={cn(
                  CELL,
                  "disabled:cursor-default",
                  meal.recipeId ? "border-border bg-card" : "border-muted bg-muted",
                  isToday && slot === "dinner" && meal.recipeId && "border-2 border-primary",
                )}
              >
                <span className={cn(CELL_LABEL, "text-muted-foreground")}>{SLOT[slot]}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[15px] leading-tight md:flex-none md:leading-[1.3]",
                    meal.recipeId ? "font-bold" : "font-semibold",
                  )}
                >
                  {meal.label}
                </span>
                {meal.recipeId && (
                  <span className="shrink-0 text-xs font-bold whitespace-nowrap text-muted-foreground md:mt-auto">
                    <span className="md:hidden">
                      {table}
                      {meal.lunchboxServings ? ` + ${meal.lunchboxServings}` : ""}
                    </span>
                    <span className="hidden md:inline">
                      {meal.lunchboxServings
                        ? `${table} + ${meal.lunchboxServings} ${meal.lunchboxServings === 1 ? "marmita" : "marmitas"}`
                        : `${table} na mesa`}
                    </span>
                  </span>
                )}
              </button>
            );
          };
          const emptyCell = (slot: Slot) =>
            editable ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => startEdit(day, slot)}
                className={cn(EMPTY_CELL, "hidden min-h-28 rounded-2xl md:flex")}
              >
                + {SLOT[slot]}
              </button>
            ) : (
              <span aria-hidden className="hidden min-h-28 md:block" />
            );
          return (
            <li
              key={day}
              className={cn(
                "grid grid-cols-[52px_1fr] gap-3 py-3 md:flex md:flex-col md:gap-2 md:py-0",
                isToday && "-mx-4 bg-peach/60 px-4 md:-m-1.5 md:rounded-[18px] md:p-1.5",
              )}
            >
              <div
                className={cn(
                  "flex flex-col text-xs font-extrabold tracking-[0.06em] md:px-0.5 md:pt-1 md:pb-2 md:tracking-[0.08em]",
                  isToday ? "text-brand-ink" : "text-muted-foreground",
                )}
              >
                {isToday ? "HOJE" : weekdayShort(day)}
                <span
                  className={cn(
                    "text-[22px] leading-[1.1] tracking-display md:text-[26px]",
                    isToday ? "text-brand-ink" : "text-foreground",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 md:gap-2">
                {lunchboxes.map((lunchbox) => (
                  <div
                    key={lunchbox.id}
                    className={cn(CELL, "border-peach-line bg-peach/60 text-peach-ink")}
                  >
                    <span className={CELL_LABEL}>Almoço</span>
                    <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold md:flex-none md:leading-[1.3]">
                      {lunchbox.label}
                    </span>
                    <LunchboxIcon
                      className="size-4 shrink-0 md:mt-auto"
                      role="img"
                      aria-hidden={false}
                      aria-label="Marmita"
                    />
                  </div>
                ))}
                {/* The lunchbox is the day's lunch: no empty lunch next to it. */}
                {lunch ? mealCell("lunch", lunch) : lunchboxes.length === 0 && emptyCell("lunch")}
                {dinner ? mealCell("dinner", dinner) : emptyCell("dinner")}

                {editable && empty ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => startEdit(day, "dinner")}
                    className={cn(EMPTY_CELL, "min-h-11 w-full text-[15px] md:hidden")}
                  >
                    <Plus className="size-[18px]" strokeWidth={2.4} aria-hidden />
                    Planejar {weekdayName(day)}
                  </button>
                ) : editable && ((!lunch && lunchboxes.length === 0) || !dinner) ? (
                  // On a phone the missing meal of a planned day is a small chip.
                  <div className="flex flex-wrap gap-1.5 md:hidden">
                    {!lunch && lunchboxes.length === 0 && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startEdit(day, "lunch")}
                        className={cn(EMPTY_CELL, "min-h-11 px-3")}
                      >
                        + Almoço
                      </button>
                    )}
                    {!dinner && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startEdit(day, "dinner")}
                        className={cn(EMPTY_CELL, "min-h-11 px-3")}
                      >
                        + Jantar
                      </button>
                    )}
                  </div>
                ) : null}
                {day < today && empty && (
                  <span className="flex min-h-10 items-center text-sm text-muted-foreground md:hidden">
                    Nada planejado
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 md:hidden">
        {canPlan && (
          <div className="flex items-center gap-2.5 rounded-[14px] bg-muted px-3.5 py-3 text-sm leading-snug">
            <Repeat2 className="size-[18px] shrink-0" aria-hidden />
            <span>
              A semana passada também deu certo?{" "}
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-bold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={disabled}
                onClick={repeat}
              >
                Repetir nos dias livres
              </button>
            </span>
          </div>
        )}
        {listButton("h-14 w-full rounded-2xl text-[17px] font-extrabold")}
      </div>

      {(shopping.items > 0 || showSuggestions) && (
        <div className="hidden gap-4 md:mt-2 md:grid md:grid-cols-[1.4fr_1fr]">
          {showSuggestions && openDay ? (
            <section
              aria-labelledby="sugestoes"
              className="space-y-2.5 rounded-[18px] bg-card px-5 py-[18px] ring-1 ring-border"
            >
              <h2 id="sugestoes" className="font-bold">
                Para escolher {theDay(openDay)}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map(({ recipe, reason }) => (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => startEdit(openDay, "dinner", recipe.id)}
                      className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-sm font-bold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {recipe.name} · {reason}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <span aria-hidden />
          )}
          {shopping.items > 0 && (
            <section
              aria-labelledby="lista-resumo"
              className="space-y-1.5 rounded-[18px] bg-muted px-5 py-[18px] text-[15px] leading-normal"
            >
              <h2 id="lista-resumo" className="font-bold">
                Lista do mercado
              </h2>
              <p className="text-muted-foreground">
                {itemsLabel} para {withRecipe} {withRecipe === 1 ? "refeição" : "refeições"}.
                {shopping.pantry.length > 0 &&
                  ` Na despensa: ${new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(shopping.pantry)}.`}
              </p>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92dvh] gap-3.5 overflow-y-auto rounded-3xl px-5 pt-2.5 pb-[22px] sm:max-w-lg sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-[26px] max-sm:border-x-0 max-sm:border-b-0"
        >
          {editor && (
            <>
              <span aria-hidden className="mx-auto h-[5px] w-11 rounded-full bg-input sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <DialogHeader className="space-y-1 text-left">
                  <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-brand-ink">
                    {longDayLabel(editor.day).replace(/ de \S+$/, "")} · {SLOT[editor.slot]}
                  </p>
                  <DialogTitle className="text-[26px] font-extrabold tracking-[-0.02em]">
                    O que vai ter?
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Uma receita das suas ou uma refeição sem receita, que não entra na lista do
                    mercado.
                  </DialogDescription>
                </DialogHeader>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-[18px]" strokeWidth={2.4} aria-hidden />
                </button>
              </div>
              <fieldset className="grid grid-cols-2 rounded-[14px] bg-muted p-1">
                <legend className="sr-only">Tipo de refeição</legend>
                {(["recipe", "free"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={editor.mode === mode}
                    onClick={() => change({ mode })}
                    className={cn(
                      "min-h-11 rounded-[10px] text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      editor.mode === mode ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {mode === "recipe" ? "Uma receita" : "Sem receita"}
                  </button>
                ))}
              </fieldset>

              {editor.mode === "recipe" ? (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      aria-label="Buscar receita"
                      placeholder="Buscar por nome ou ingrediente"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-12 rounded-[14px] bg-card pl-10 text-base"
                    />
                  </div>
                  {recipes.length === 0 ? (
                    <p className="rounded-xl bg-muted p-4 text-sm">
                      Você ainda não tem receitas.{" "}
                      <Link
                        href="/receitas?trazer=1"
                        className="font-bold underline underline-offset-4"
                      >
                        Trazer uma receita
                      </Link>
                    </p>
                  ) : (
                    <>
                      {!query && (
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                          Favoritas e faz tempo
                        </p>
                      )}
                      <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Suas receitas">
                        {visible.map((recipe) => {
                          const on = editor.recipeId === recipe.id;
                          return (
                            <li key={recipe.id}>
                              <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => change({ recipeId: recipe.id })}
                                className={cn(
                                  "flex min-h-14 w-full items-center gap-3 rounded-[14px] border-[1.5px] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  on ? "border-foreground bg-card" : "border-border bg-card",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    "size-[22px] shrink-0 rounded-full border-2",
                                    on ? "border-[7px] border-foreground" : "border-input",
                                  )}
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-px">
                                  <span className="text-[15px] font-bold leading-tight">
                                    {recipe.name}
                                  </span>
                                  <span className="text-[13px] text-muted-foreground">
                                    {choiceMeta(recipe, now)}
                                  </span>
                                </span>
                                {recipe.isFavorite && (
                                  <Star
                                    className="size-4 shrink-0 fill-current text-brand-ink"
                                    aria-label="Favorita"
                                  />
                                )}
                              </button>
                            </li>
                          );
                        })}
                        {visible.length === 0 && (
                          <li className="p-3 text-sm text-muted-foreground">
                            Nenhuma receita com esse nome ou ingrediente.
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[...FREE_MEALS, "Outra coisa"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={editor.free === label}
                        onClick={() => change({ free: label })}
                        className={cn(
                          "min-h-11 rounded-full border-[1.5px] px-4 text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          editor.free === label
                            ? "border-foreground bg-secondary text-secondary-foreground"
                            : "border-border bg-card",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {editor.free === "Outra coisa" && (
                    <div className="space-y-2">
                      <Label htmlFor="meal-label">O que vai ter?</Label>
                      <Input
                        id="meal-label"
                        value={editor.other}
                        maxLength={120}
                        onChange={(event) => change({ other: event.target.value })}
                        placeholder="Ex.: almoço na casa da vó"
                        className="h-12 rounded-xl bg-card"
                      />
                    </div>
                  )}
                  <p className="text-sm leading-normal text-muted-foreground">
                    Sem receita, a refeição não entra na lista do mercado.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border pt-3.5">
                {editor.mode === "recipe" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">Na mesa</span>
                      <Stepper
                        label="Na mesa"
                        value={editor.table}
                        min={editor.lunchbox > 0 ? 0 : 1}
                        max={50}
                        onChange={(table) => change({ table })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-bold text-peach-ink">
                        <LunchboxIcon className="size-[18px]" />
                        Marmitas
                      </span>
                      <Stepper
                        label="Marmitas"
                        tone="peach"
                        value={editor.lunchbox}
                        min={editor.table > 0 ? 0 : 1}
                        max={50}
                        onChange={(lunchbox) => change({ lunchbox })}
                      />
                    </div>
                    <p
                      role="status"
                      className="rounded-xl bg-muted px-3 py-2.5 text-sm leading-snug"
                    >
                      {portionsHint}
                    </p>
                  </div>
                )}
                <Button
                  className="h-14 rounded-2xl text-[17px] font-extrabold"
                  disabled={disabled || !canSave}
                  onClick={save}
                >
                  {pending ? "Salvando…" : `Colocar ${onDay(editor.day)}`}
                </Button>
                {editor.existingId && (
                  <Button
                    variant="ghost"
                    className="min-h-11 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={remove}
                  >
                    Tirar da semana
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
