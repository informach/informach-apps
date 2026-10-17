"use client";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { RecipeCover } from "@/features/recipes/components/recipe-cover";
import { planFirstWeekAction } from "../actions";

type Option = { key: string; name: string; servings: number | null };

const MAX_PICKS = 4;

/** First access: three recipes, three days and the shopping list, before anything else. */
export function FirstWeek({
  own,
  starters,
  trialPending,
}: {
  own: (Option & { id: string })[];
  starters: (Option & { index: number })[];
  trialPending: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [picked, setPicked] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const toggle = (key: string) =>
    setPicked((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length >= MAX_PICKS
          ? current
          : [...current, key],
    );
  const missing = Math.max(0, 3 - picked.length);
  const submit = () =>
    startTransition(async () => {
      const result = await catchActionResult(() =>
        planFirstWeekAction({
          starters: starters.filter((s) => picked.includes(s.key)).map((s) => s.index),
          recipeIds: own.filter((r) => picked.includes(r.key)).map((r) => r.id),
        }),
      );
      if (!result.ok) {
        const code: string = result.error.code;
        if (["TRIAL_ALREADY_USED", "TRIAL_EXPIRED", "SUBSCRIPTION_REQUIRED"].includes(code)) {
          setBlocked(true);
          return;
        }
        toast.error("Não foi possível montar a semana. Tente de novo.");
        return;
      }
      toast.success(`Pronto: ${result.value.planned} jantares a partir de hoje.`);
      router.refresh();
    });

  const renderOption = (option: Option) => {
    const on = picked.includes(option.key);
    return (
      <li key={option.key}>
        <button
          type="button"
          aria-pressed={on}
          disabled={!hydrated || pending}
          onClick={() => toggle(option.key)}
          className={cn(
            "flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border-[1.5px] bg-card p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            on ? "border-foreground" : "border-border hover:border-input",
          )}
        >
          <RecipeCover
            name={option.name}
            className="size-12 shrink-0 rounded-xl [&_span]:text-3xl"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-bold leading-tight">{option.name}</span>
            <span className="text-sm text-muted-foreground">
              {option.servings ? `Rende ${option.servings}` : "Rendimento a conferir"}
            </span>
          </span>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
              on
                ? "border-sage bg-sage text-white dark:text-background"
                : "border-input text-transparent",
            )}
          >
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby="first-week-title" className="mx-auto w-full max-w-xl space-y-6">
      <div className="space-y-3">
        <p className="text-[15px] font-bold text-brand-ink">Que bom ter você aqui.</p>
        <h1
          id="first-week-title"
          className="text-[34px] font-extrabold leading-[1.02] tracking-display md:text-5xl"
        >
          Vamos montar sua primeira semana.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Três receitas, três dias e a lista do mercado.
          {trialPending
            ? " Seus 14 dias grátis começam quando a primeira receita entrar na semana. Sem cartão."
            : ""}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        <span className="h-1.5 rounded-full bg-primary" />
        <span className="h-1.5 rounded-full bg-border" />
        <span className="h-1.5 rounded-full bg-border" />
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold">Escolha três para começar</h2>
        <p role="status" className="text-sm font-bold text-muted-foreground">
          {picked.length <= 3 ? `${picked.length} de 3` : `${picked.length} escolhidas`}
        </p>
      </div>
      {own.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            Suas receitas
          </p>
          <ul className="space-y-2">{own.map(renderOption)}</ul>
        </div>
      )}
      <div className="space-y-2">
        {own.length > 0 && (
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            Da coleção do Cozya
          </p>
        )}
        <ul className="space-y-2">{starters.map(renderOption)}</ul>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rascunhos da coleção do Cozya, ainda sem teste em cozinha. Confira antes de cozinhar.
        </p>
      </div>
      <Link
        href="/receitas?trazer=1"
        className="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
      >
        Prefiro trazer uma receita minha
      </Link>
      {blocked ? (
        <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4">
          <p className="font-bold">Este e-mail já usou o teste grátis.</p>
          <p className="text-sm text-muted-foreground">
            Suas receitas continuam aqui. Para colocar receitas na semana, assine o Pro.
          </p>
          <Button asChild className="min-h-11">
            <Link href="/upgrade">Conhecer o Pro</Link>
          </Button>
        </div>
      ) : (
        <Button
          className="h-14 w-full rounded-2xl text-[17px] font-extrabold"
          disabled={!hydrated || pending || missing > 0}
          onClick={submit}
        >
          {pending
            ? "Montando a semana…"
            : missing > 0
              ? `Escolha mais ${missing === 1 ? "uma" : missing === 2 ? "duas" : "três"}`
              : "Colocar nos dias"}
        </Button>
      )}
    </section>
  );
}
