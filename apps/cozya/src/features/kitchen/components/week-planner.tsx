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
import { Minus, Plus, Repeat2, Search, Star } from "lucide-react";
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
import { addDays, cookedAgo, longDayLabel, weekdayName, weekdayShort } from "../dates";
import type { Meal } from "../types";

export type RecipeChoice = {
  id: string;
  name: string;
  servings: number | null;
  totalMinutes: number | null;
  isFavorite: boolean;
  lastCookedAt: Date | null;
  verdict: "again" | "tweak" | "skip" | null;
};

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

function choiceMeta(recipe: RecipeChoice, now: Date) {
  const parts = [recipe.servings ? `rende ${recipe.servings}` : "rendimento a conferir"];
  if (recipe.verdict === "skip") parts.push("você disse que não repetiria");
  else parts.push(recipe.lastCookedAt ? cookedAgo(recipe.lastCookedAt, now) : "ainda não fez");
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
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
        className="min-w-7 text-center text-[17px] font-extrabold"
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
  /** Sunday's dinner before this week, whose lunchboxes are Monday's lunch. */
  carryOver: Meal | null;
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
  const startEdit = (day: string, slot: Slot) => {
    setDirty(false);
    setSearch("");
    setEditor(editorFor(day, slot));
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

  const selected = recipes.find((recipe) => recipe.id === editor?.recipeId) ?? null;
  const visible = recipes.filter((recipe) =>
    recipe.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .includes(search.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()),
  );
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

  const disabled = !hydrated || pending;

  return (
    <div className="space-y-5">
      {summary && (
        <p className="text-center text-[15px] text-muted-foreground md:text-left">{summary}.</p>
      )}

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
          Seus 14 dias grátis começam quando a primeira receita entrar na semana. Sem cartão.
        </p>
      )}

      <ol className="divide-y divide-border md:grid md:grid-cols-7 md:gap-3 md:divide-y-0">
        {days.map((day) => {
          const isToday = day === today;
          const lunch = meals.find((meal) => meal.day === day && meal.slot === "lunch");
          const dinner = meals.find((meal) => meal.day === day && meal.slot === "dinner");
          const previousDinner =
            meals.find((meal) => meal.day === addDays(day, -1) && meal.slot === "dinner") ??
            (day === week ? (carryOver ?? undefined) : undefined);
          const lunchbox =
            !lunch && previousDinner && previousDinner.lunchboxServings > 0 ? previousDinner : null;
          const slotButton = (slot: Slot, meal: Meal | undefined) =>
            meal ? (
              <button
                type="button"
                disabled={disabled || !canEdit}
                onClick={() => startEdit(day, slot)}
                aria-label={`${SLOT[slot]} de ${weekdayName(day)}: ${meal.label}. Trocar`}
                className={cn(
                  "flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  meal.recipeId ? "border-border bg-card" : "border-transparent bg-muted",
                  isToday && slot === "dinner" && meal.recipeId && "border-2 border-primary",
                )}
              >
                <span className="w-14 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground md:hidden">
                  {SLOT[slot]}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[15px] leading-snug",
                    meal.recipeId ? "font-bold" : "font-semibold",
                  )}
                >
                  {meal.label}
                </span>
                {meal.recipeId && (
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {meal.servings - meal.lunchboxServings}
                    {meal.lunchboxServings ? ` + ${meal.lunchboxServings}` : ""}
                  </span>
                )}
              </button>
            ) : null;
          return (
            <li
              key={day}
              className={cn(
                "grid grid-cols-[52px_1fr] gap-3 py-3 md:flex md:flex-col md:rounded-2xl md:p-2",
                isToday && "-mx-4 bg-peach/60 px-4 md:mx-0 md:px-2",
              )}
            >
              <div
                className={cn(
                  "flex flex-col text-xs font-extrabold tracking-[0.06em]",
                  isToday ? "text-brand-ink" : "text-muted-foreground",
                )}
              >
                {isToday ? "HOJE" : weekdayShort(day)}
                <span
                  className={cn(
                    "text-[22px] leading-tight tracking-display",
                    isToday ? "text-brand-ink" : "text-foreground",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                {lunch
                  ? slotButton("lunch", lunch)
                  : lunchbox && (
                      <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-peach-line bg-peach px-3 py-2 text-peach-ink">
                        <span className="w-14 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.06em] md:hidden">
                          Almoço
                        </span>
                        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">
                          {lunchbox.label}
                        </span>
                        <LunchboxIcon
                          className="size-4 shrink-0"
                          role="img"
                          aria-hidden={false}
                          aria-label="Marmita"
                        />
                      </div>
                    )}
                {slotButton("dinner", dinner)}
                {day < today && !lunch && !lunchbox && !dinner && (
                  <span className="flex min-h-10 items-center text-sm text-muted-foreground">
                    Nada planejado
                  </span>
                )}
                {canEdit && day >= today && ((!lunch && !lunchbox) || !dinner) && (
                  <div className="flex flex-wrap gap-1.5">
                    {!lunch && !lunchbox && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startEdit(day, "lunch")}
                        className="min-h-11 rounded-xl border-[1.5px] border-dashed border-input px-3 text-sm font-bold text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        + Almoço
                      </button>
                    )}
                    {!dinner && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startEdit(day, "dinner")}
                        className="min-h-11 rounded-xl border-[1.5px] border-dashed border-input px-3 text-sm font-bold text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        + Jantar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {canPlan && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-3.5 text-sm">
          <Repeat2 className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">A semana passada também deu certo?</span>
          <Button
            variant="ghost"
            className="min-h-11 font-bold underline underline-offset-4"
            disabled={disabled}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() => repeatWeekAction({ week }));
                if (!result.ok) toast.error("Não foi possível repetir a semana.");
                else
                  toast.success(
                    result.value
                      ? `${result.value} ${result.value === 1 ? "refeição copiada" : "refeições copiadas"} para os dias livres. O que já estava planejado ficou como estava.`
                      : "Nada para copiar: a semana passada não tinha refeições nos dias livres.",
                  );
              })
            }
          >
            Repetir nos dias livres
          </Button>
        </div>
      )}

      {meals.length > 0 && (
        <Button
          className="h-14 w-full rounded-2xl text-[17px] font-extrabold"
          disabled={disabled || (!canPlan && list === "none")}
          onClick={() =>
            // Without planning access the list that exists can still be opened, not rebuilt.
            list === "fresh" || !canPlan
              ? router.push(`/compras?week=${week}`)
              : startTransition(async () => {
                  const result = await catchActionResult(() => generateShoppingAction({ week }));
                  if (!result.ok) toast.error("Não foi possível montar a lista.");
                  else router.push(`/compras?week=${week}`);
                })
          }
        >
          {pending
            ? "Um instante…"
            : list === "fresh" || !canPlan
              ? "Abrir a lista do mercado"
              : list === "stale"
                ? "Atualizar a lista do mercado"
                : "Montar a lista do mercado"}
        </Button>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto rounded-3xl sm:max-w-lg">
          {editor && (
            <>
              <DialogHeader className="text-left">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-brand-ink">
                  {longDayLabel(editor.day)} · {SLOT[editor.slot]}
                </p>
                <DialogTitle className="text-2xl font-extrabold tracking-display">
                  O que vai ter?
                </DialogTitle>
                <DialogDescription>
                  Uma receita das suas ou uma refeição sem receita, que não entra na lista do
                  mercado.
                </DialogDescription>
              </DialogHeader>
              <fieldset className="grid grid-cols-2 rounded-xl bg-muted p-1">
                <legend className="sr-only">Tipo de refeição</legend>
                {(["recipe", "free"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={editor.mode === mode}
                    onClick={() => change({ mode })}
                    className={cn(
                      "min-h-11 rounded-lg text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      editor.mode === mode ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {mode === "recipe" ? "Uma receita" : "Sem receita"}
                  </button>
                ))}
              </fieldset>

              {editor.mode === "recipe" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      aria-label="Buscar receita"
                      placeholder="Buscar pelo nome"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-12 rounded-xl bg-card pl-10"
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
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="Suas receitas">
                      {visible.map((recipe) => {
                        const on = editor.recipeId === recipe.id;
                        return (
                          <li key={recipe.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => change({ recipeId: recipe.id })}
                              className={cn(
                                "flex min-h-14 w-full items-center gap-3 rounded-xl border-[1.5px] bg-card px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on ? "border-foreground" : "border-border",
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "size-[22px] shrink-0 rounded-full border-2",
                                  on ? "border-[7px] border-foreground" : "border-input",
                                )}
                              />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="font-bold leading-snug">{recipe.name}</span>
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
                          Nenhuma receita com esse nome.
                        </li>
                      )}
                    </ul>
                  )}
                  <div className="space-y-2.5 border-t border-border pt-3">
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
                    <p role="status" className="rounded-xl bg-muted p-3 text-sm leading-relaxed">
                      {portionsHint}
                    </p>
                  </div>
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
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-4">
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
