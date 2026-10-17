import { Check, Minus } from "lucide-react";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { getKitchenAccess } from "@/features/kitchen/access";
import { localDay, longDayLabel } from "@/features/kitchen/dates";
import { getTrialSummary } from "@/features/kitchen/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Assinar o Pro | Cozya",
};

const STATS = [
  { key: "meals", one: "refeição com receita na semana", many: "refeições com receita na semana" },
  { key: "lists", one: "lista usada no mercado", many: "listas usadas no mercado" },
  { key: "recipes", one: "receita guardada", many: "receitas guardadas" },
  { key: "cooked", one: "vez “pronto, cozinhei”", many: "vezes “pronto, cozinhei”" },
] as const;

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const cycleParam = typeof params.cycle === "string" ? params.cycle : undefined;
  const access = await getKitchenAccess(user.id);
  const trialStart = access.profile?.trialStartedAt ?? null;
  const summary = trialStart && !access.isPro ? await getTrialSummary(user.id, trialStart) : null;
  const endsAt = access.trialEndsAt;
  const days = trialStart
    ? Math.max(1, Math.ceil((Date.now() - trialStart.getTime()) / 86400000))
    : 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-8 md:px-8 md:py-12">
      {summary && (
        <section aria-labelledby="trial-title" className="mx-auto max-w-2xl space-y-5">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-brand-ink">
            {access.trialActive && endsAt
              ? `Seu teste termina ${longDayLabel(localDay(endsAt)).toLocaleLowerCase("pt-BR")}`
              : "Seu teste terminou"}
          </p>
          <h1
            id="trial-title"
            className="text-[38px] font-extrabold leading-none tracking-display md:text-5xl"
          >
            Sua semana continua aqui.
          </h1>
          <p className="text-muted-foreground">
            Foi isso que a sua casa fez{" "}
            {access.trialActive
              ? days <= 1
                ? "neste primeiro dia"
                : `nestes ${Math.min(days, 14)} dias`
              : "nos 14 dias"}
            :
          </p>
          <ul className="grid grid-cols-2 gap-2.5">
            {STATS.map((stat) => {
              const value = summary[stat.key];
              return (
                <li key={stat.key} className="space-y-1 rounded-2xl bg-card p-4 ring-1 ring-border">
                  <span className="block text-3xl font-extrabold leading-none tracking-display">
                    {value}
                  </span>
                  <span className="block text-sm leading-snug text-muted-foreground">
                    {value === 1 ? stat.one : stat.many}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex justify-center">
        <PlanCards
          initialCycle={parseCycleQueryParam(cycleParam ?? (summary ? "anual" : undefined))}
          showStepper={false}
          showFreePlan={false}
          titleAs={summary ? "h2" : "h1"}
        />
      </div>

      {summary && (
        <section aria-labelledby="free-title" className="mx-auto max-w-2xl space-y-3">
          <h2 id="free-title" className="text-lg font-extrabold">
            {access.trialActive
              ? "Se não assinar, a conta fica no Free:"
              : "Agora a conta está no Free:"}
          </h2>
          <p className="flex gap-2.5">
            <Check className="mt-0.5 size-5 shrink-0 text-sage" aria-hidden />
            Suas receitas, o modo cozinha e as listas que já existem continuam.
          </p>
          <p className="flex gap-2.5">
            <Minus className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />
            Novas semanas e a ajuda da IA param. Receitas novas só até o acervo chegar a 15.
          </p>
        </section>
      )}
    </div>
  );
}
