"use client";
import { Button } from "@informach/ui/components/button";
import { Checkbox } from "@informach/ui/components/checkbox";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { Textarea } from "@informach/ui/components/textarea";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Check, Sun, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { z } from "zod";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import type { Recipe } from "@/features/recipes/types";
import { cookingAction, cookingFeedbackAction } from "../actions";
import { parseIngredients, scaleIngredient } from "../ingredients";
import { keyedLines } from "../list-keys";
import type { cookingInputSchema } from "../schemas";
import { minutesInStep } from "../step-timer";
import type { CookingSession as Session } from "../types";
import { useCookingTimer, useScreenAwake } from "./use-cooking-tools";

type Verdict = "again" | "tweak" | "skip";
const VERDICTS: { value: Verdict; label: string; mark: string }[] = [
  { value: "again", label: "Faria de novo", mark: "+" },
  { value: "tweak", label: "Com ajustes", mark: "~" },
  { value: "skip", label: "Não repetiria", mark: "−" },
];

function portionsLabel(servings: number, lunchboxes: number) {
  const table = servings - lunchboxes;
  if (!lunchboxes) return `${servings} ${servings === 1 ? "porção" : "porções"}`;
  return `${table} na mesa + ${lunchboxes} ${lunchboxes === 1 ? "marmita" : "marmitas"}`;
}

/** One step per screen, large type, the timer where the step asks for it, and "Como foi?" at the end. */
export function CookingMode({
  recipe,
  initialSession,
  servings,
  lunchboxes,
  note,
  verdict: initialVerdict,
  startAtFeedback,
}: {
  recipe: Recipe;
  initialSession: Session | null;
  servings: number;
  lunchboxes: number;
  note: string | null;
  verdict: Verdict | null;
  startAtFeedback: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [session, setSession] = useState(initialSession);
  const steps = recipe.preparation
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
  const ingredients = parseIngredients(recipe.ingredients);
  const firstOpen = steps.findIndex((_, index) => !initialSession?.completedSteps.includes(index));
  const [step, setStep] = useState(firstOpen === -1 ? Math.max(0, steps.length - 1) : firstOpen);
  const [feedback, setFeedback] = useState(startAtFeedback);
  const [showIngredients, setShowIngredients] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(initialVerdict ?? "again");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const wakeStatus = useScreenAwake(true);
  const timer = useCookingTimer(session?.timerEndsAt ?? null);
  const completedOnce = useRef(false);

  const save = (operation: z.infer<typeof cookingInputSchema>["operation"]) =>
    catchActionResult(() => cookingAction({ recipeId: recipe.id, servings, operation })).then(
      (result) => {
        if (!result.ok) {
          toast.error("Não foi possível salvar o progresso. Tente de novo.");
          return null;
        }
        setSession(result.value);
        return result.value;
      },
    );

  // "Já cozinhei" from Hoje lands here: register the preparation, then ask how it went.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the intent the page was opened with
  useEffect(() => {
    if (!startAtFeedback || completedOnce.current) return;
    completedOnce.current = true;
    void save({ type: "complete" });
  }, [startAtFeedback]);

  const current = steps[step] ?? "";
  const minutes = minutesInStep(current);
  const last = step >= steps.length - 1;
  const endsAt = session?.timerEndsAt ? new Date(session.timerEndsAt) : null;

  const goNext = () =>
    startTransition(async () => {
      if (!session?.completedSteps.includes(step))
        await save({ type: "step", index: step, checked: true });
      if (last) {
        const done = await save({ type: "complete" });
        if (done) setFeedback(true);
      } else setStep(step + 1);
    });

  if (feedback)
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-8">
        <div className="space-y-3">
          <span className="flex size-[60px] items-center justify-center rounded-full bg-sage text-white dark:text-background">
            <Check className="size-8" strokeWidth={2.8} aria-hidden />
          </span>
          <h1 className="text-[40px] font-extrabold leading-none tracking-display">Bom apetite!</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {recipe.name}, {portionsLabel(servings, lunchboxes)}.
            {lunchboxes > 0 ? " A marmita já está contada para amanhã." : ""}
          </p>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-xl font-extrabold">Como foi?</legend>
          <div className="grid grid-cols-3 gap-2">
            {VERDICTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={verdict === option.value}
                onClick={() => setVerdict(option.value)}
                className={cn(
                  "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] px-2 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  verdict === option.value
                    ? "border-foreground bg-secondary text-secondary-foreground"
                    : "border-border bg-card",
                )}
              >
                <span aria-hidden className="text-xl leading-none">
                  {option.mark}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="cook-note" className="text-base font-bold">
            Uma nota para a próxima vez
          </Label>
          <Textarea
            id="cook-note"
            rows={3}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex.: metade do ketchup ficou ótimo; dobrar o champignon"
            className="rounded-2xl bg-card text-base"
          />
          <p className="text-sm text-muted-foreground">
            {verdict === "skip"
              ? "Ela continua nas suas receitas, mas sai das sugestões de quem faz tempo."
              : "A nota aparece no Hoje e no modo cozinha quando a receita voltar para a semana."}
          </p>
        </div>
        {note && (
          <p className="rounded-2xl bg-muted p-4 text-sm leading-relaxed">
            Da última vez você anotou: “{note}”.{" "}
            {text.trim() ? "A nota nova fica no lugar dela." : "Sem nota nova, ela continua."}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <Button
            className="h-14 rounded-2xl text-[17px] font-extrabold"
            disabled={!hydrated || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() =>
                  cookingFeedbackAction({
                    recipeId: recipe.id,
                    verdict,
                    note: text.trim() || note || "",
                  }),
                );
                if (!result.ok) {
                  toast.error("Não foi possível salvar a nota. Tente de novo.");
                  return;
                }
                router.push("/hoje");
              })
            }
          >
            {pending ? "Salvando…" : "Salvar e voltar para Hoje"}
          </Button>
          <Button asChild variant="ghost" className="min-h-12 text-[15px] font-bold">
            <Link href="/hoje">Agora não</Link>
          </Button>
        </div>
      </main>
    );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-5 py-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/receitas/${recipe.id}`}
          aria-label="Sair do modo cozinha"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{recipe.name}</p>
          <p className="text-sm text-muted-foreground">{portionsLabel(servings, lunchboxes)}</p>
        </div>
        {wakeStatus.startsWith("Tela ligada") && (
          <span className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-sage-soft px-2.5 text-xs font-extrabold text-sage-ink">
            <Sun className="size-3.5" aria-hidden />
            Tela ligada
          </span>
        )}
      </div>

      <div className="flex gap-1.5" aria-hidden>
        {steps.map((_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
            key={index}
            className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>

      <section aria-live="polite" className="flex flex-1 flex-col gap-4">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-brand-ink">
          Passo {step + 1} de {steps.length}
        </p>
        <p className="text-[26px] font-semibold leading-[1.35] md:text-3xl">{current}</p>

        {note && (
          <div className="rounded-2xl bg-card p-4 text-[15px] leading-snug ring-1 ring-border">
            <p className="mb-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
              Sua nota da última vez
            </p>
            {note}
          </div>
        )}

        {endsAt ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-4 text-secondary-foreground">
            <div className="flex flex-col">
              <span
                role="timer"
                aria-label="Tempo restante"
                className="text-[40px] font-extrabold leading-none tracking-display tabular-nums"
              >
                {timer.display}
              </span>
              <span className="text-sm opacity-80">
                {timer.expired
                  ? "O tempo terminou. Confira a panela."
                  : `Termina às ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(endsAt).replace(":", "h")}`}
              </span>
            </div>
            <Button
              variant="outline"
              className="min-h-11 border-current bg-transparent text-current hover:bg-white/10"
              disabled={!hydrated || pending}
              onClick={() =>
                startTransition(async () => void (await save({ type: "timer", minutes: 0 })))
              }
            >
              Parar
            </Button>
          </div>
        ) : (
          minutes && (
            <Button
              className="min-h-14 rounded-2xl bg-secondary text-[17px] font-extrabold text-secondary-foreground hover:bg-secondary/90"
              disabled={!hydrated || pending}
              onClick={() =>
                startTransition(async () => void (await save({ type: "timer", minutes })))
              }
            >
              <Timer className="size-5" aria-hidden />
              Marcar {minutes} {minutes === 1 ? "minuto" : "minutos"}
            </Button>
          )
        )}

        <button
          type="button"
          aria-expanded={showIngredients}
          onClick={() => setShowIngredients((value) => !value)}
          className="min-h-11 self-start font-bold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showIngredients ? "Esconder ingredientes" : `Ver os ${ingredients.length} ingredientes`}
        </button>
        {showIngredients && (
          <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
            {keyedLines(ingredients, (item) => item.original).map(({ item, key }, index) => {
              const checked = session?.checkedIngredients.includes(index) ?? false;
              return (
                <li key={key}>
                  <label
                    htmlFor={`cook-ingredient-${index}`}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-base",
                      checked && "text-muted-foreground line-through",
                    )}
                  >
                    <Checkbox
                      id={`cook-ingredient-${index}`}
                      checked={checked}
                      disabled={!hydrated || pending}
                      onCheckedChange={(value) =>
                        startTransition(
                          async () =>
                            void (await save({
                              type: "ingredient",
                              index,
                              checked: value === true,
                            })),
                        )
                      }
                      className="size-5 shrink-0"
                    />
                    <span>{scaleIngredient(item, recipe.servings ?? null, servings)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-[120px_1fr] gap-2.5">
        <Button
          variant="outline"
          className="h-[60px] rounded-2xl bg-card text-[17px] font-bold"
          disabled={!hydrated || step === 0}
          onClick={() => setStep(step - 1)}
        >
          Voltar
        </Button>
        <Button
          className="h-[60px] rounded-2xl text-[17px] font-extrabold"
          disabled={!hydrated || pending}
          onClick={goNext}
        >
          {last ? "Pronto, cozinhei" : "Próximo passo"}
        </Button>
      </div>
      <p className="-mt-2 text-center text-xs text-muted-foreground">
        O tempo fica salvo na conta, mas não toca com o app fechado.
        {wakeStatus && !wakeStatus.startsWith("Tela ligada") ? ` ${wakeStatus}` : ""}
      </p>
    </main>
  );
}
