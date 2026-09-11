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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { toast } from "@informach/ui/components/sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import {
  generateShoppingAction,
  removeMealAction,
  repeatWeekAction,
  saveMealAction,
} from "../actions";
import { addDays, dayLabel } from "../dates";
import type { Meal } from "../types";

type Choice = { id: string; name: string; servings: number | null };
type Editor = {
  day: string;
  slot: "lunch" | "dinner";
  recipeId: string;
  label: string;
  servings: number;
};

export function WeekPlanner({
  week,
  meals,
  recipes,
  canPlan,
  householdSize,
}: {
  week: string;
  meals: Meal[];
  recipes: Choice[];
  canPlan: boolean;
  householdSize: number;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const change = (value: Partial<Editor>) => {
    setEditor((previous) => (previous ? { ...previous, ...value } : null));
    setDirty(true);
  };
  const close = () => {
    if (!pending && (!dirty || window.confirm("Descartar as alterações desta refeição?")))
      setEditor(null);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!canPlan || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await catchActionResult(() => repeatWeekAction({ week }));
              if (!result.ok) toast.error("Não foi possível repetir a semana.");
              else
                toast.success(
                  result.value
                    ? `${result.value} refeições copiadas. Seus horários já preenchidos foram preservados.`
                    : "Nenhuma refeição disponível na semana anterior para os horários vazios.",
                );
            })
          }
        >
          Repetir semana anterior
        </Button>
        <Button
          className="min-h-11"
          disabled={!canPlan || pending || !meals.length}
          onClick={() =>
            startTransition(async () => {
              const result = await catchActionResult(() => generateShoppingAction({ week }));
              if (!result.ok) toast.error("Não foi possível gerar as compras.");
              else router.push(`/compras?week=${week}`);
            })
          }
        >
          {pending ? "Salvando…" : "Gerar lista de compras"}
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={`/compras?week=${week}`}>Abrir compras →</Link>
        </Button>
      </div>
      {!canPlan && (
        <p className="rounded-xl border p-4 text-sm">
          Seu plano continua aqui.{" "}
          <Link className="underline" href="/upgrade">
            Assine o Pro
          </Link>{" "}
          ou inicie o teste nas receitas para planejar novas refeições.
        </p>
      )}
      {meals.length === 0 && (
        <p className="text-muted-foreground">
          Comece com 3 jantares. Inclua porções extras para a marmita do dia seguinte.
        </p>
      )}
      <div className="divide-y divide-border rounded-2xl border border-border">
        {Array.from({ length: 7 }, (_, index) => addDays(week, index)).map((day) => (
          <section key={day} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr_1fr] sm:p-5">
            <h2 className="font-semibold capitalize">{dayLabel(day)}</h2>
            {(["lunch", "dinner"] as const).map((slot) => {
              const meal = meals.find((entry) => entry.day === day && entry.slot === slot);
              const slotLabel = slot === "lunch" ? "Almoço" : "Jantar";
              return (
                <div key={slot} className="space-y-2 rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {slotLabel}
                  </p>
                  {meal ? (
                    <>
                      <p className="font-medium">{meal.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {meal.servings} porções{!meal.recipeId ? " · compras a conferir" : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        {meal.recipeId && (
                          <Button asChild variant="ghost" className="min-h-11 px-2">
                            <Link href={`/receitas/${meal.recipeId}?porcoes=${meal.servings}`}>
                              Preparar
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className="min-h-11 px-2"
                          disabled={!canPlan || pending}
                          onClick={() => {
                            setDirty(false);
                            setEditor({
                              day,
                              slot,
                              recipeId: meal.recipeId ?? "manual",
                              label: meal.label,
                              servings: meal.servings,
                            });
                          }}
                        >
                          Trocar
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11 px-2 text-muted-foreground"
                          disabled={pending}
                          aria-label={`Remover ${slotLabel} de ${dayLabel(day)}`}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await catchActionResult(() =>
                                removeMealAction({ id: meal.id }),
                              );
                              if (!result.ok) toast.error("Não foi possível remover a refeição.");
                            })
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      className="min-h-11 w-full justify-start"
                      disabled={!canPlan}
                      onClick={() => {
                        setDirty(false);
                        setEditor({
                          day,
                          slot,
                          recipeId: "manual",
                          label: "",
                          servings: householdSize,
                        });
                      }}
                    >
                      + Planejar {slotLabel.toLowerCase()}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planejar refeição</DialogTitle>
            <DialogDescription>
              {editor
                ? `${editor.slot === "lunch" ? "Almoço" : "Jantar"} · ${dayLabel(editor.day)}`
                : "Escolha o que preparar"}
              . As porções incluem quem come agora e as marmitas.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await catchActionResult(() =>
                    saveMealAction({
                      ...editor,
                      recipeId: editor.recipeId === "manual" ? null : editor.recipeId,
                    }),
                  );
                  if (!result.ok)
                    toast.error(
                      "Não foi possível salvar. Confira os campos e seu acesso ao planejamento.",
                    );
                  else {
                    setEditor(null);
                    setDirty(false);
                    toast.success("Refeição planejada");
                  }
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="meal-recipe">Receita</Label>
                <Select value={editor.recipeId} onValueChange={(recipeId) => change({ recipeId })}>
                  <SelectTrigger id="meal-recipe" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Refeição livre / sobras / fora de casa</SelectItem>
                    {recipes.map((recipe) => (
                      <SelectItem key={recipe.id} value={recipe.id}>
                        {recipe.name}
                        {recipe.servings ? ` · rende ${recipe.servings}` : " · conferir rendimento"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editor.recipeId === "manual" && (
                <div className="space-y-2">
                  <Label htmlFor="meal-label">O que vai ter?</Label>
                  <Input
                    id="meal-label"
                    value={editor.label}
                    onChange={(event) => change({ label: event.target.value })}
                    required
                    maxLength={120}
                    placeholder="Ex.: sobras do jantar ou almoço fora"
                  />
                  <p className="text-xs text-muted-foreground">
                    Refeições livres não geram ingredientes automaticamente.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="meal-servings">Porções para preparar</Label>
                <Input
                  id="meal-servings"
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={editor.servings}
                  onChange={(event) => change({ servings: event.target.valueAsNumber })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={pending} onClick={close}>
                  Cancelar
                </Button>
                <Button disabled={pending} type="submit">
                  {pending ? "Salvando…" : "Salvar refeição"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
