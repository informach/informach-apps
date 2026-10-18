import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { ProOffer } from "@/features/billing/components/pro-offer";
import { PRO_MONTHLY_CREDITS, parseCycleQueryParam } from "@/features/billing/plans-content";
import { getBillingSubscriptionHistoryForUser } from "@/features/billing/server-cache";
import { getKitchenAccess } from "@/features/kitchen/access";
import { daysBetween, localDay, longDayLabel } from "@/features/kitchen/dates";
import { getTrialSummary } from "@/features/kitchen/repository";
import { hasEverSubscribed, TRIAL_DAYS, trialEnded, trialRecap } from "@/features/kitchen/trial";
import { FREE_RECIPE_LIMIT } from "@/features/recipes/limits";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Assinar o Pro | Cozya",
};

const STATS = [
  { key: "meals", one: "refeição com receita na semana", many: "refeições com receita na semana" },
  { key: "lists", one: "lista usada no mercado", many: "listas usadas no mercado" },
  { key: "recipes", one: "receita sua guardada", many: "receitas suas guardadas" },
  { key: "cooked", one: "vez “pronto, cozinhei”", many: "vezes “pronto, cozinhei”" },
] as const;

/** "31", or "1º" on the first day of the month, as dates are written in Portuguese. */
function dayOfMonth(day: string) {
  const value = Number(day.slice(8));
  return value === 1 ? "1º" : String(value);
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const cycleParam = typeof params.cycle === "string" ? params.cycle : undefined;
  const access = await getKitchenAccess(user.id);
  // "Seu teste terminou" only for who just left the trial: never for who subscribed and
  // cancelled, nor for who comes back months later. The numbers count the trial days only.
  const everSubscribed =
    trialEnded(access) && hasEverSubscribed(await getBillingSubscriptionHistoryForUser(user.id));
  const recap = trialRecap(access, everSubscribed);
  const summary = recap ? await getTrialSummary(user.id, recap) : null;
  // The trial ends on this day, at the hour it began: that same day the account is in the Free.
  const lastDay = recap ? localDay(recap.to) : null;
  const daysSoFar = recap ? Math.min(TRIAL_DAYS, daysBetween(recap.from) + 1) : 0;
  const initialCycle = parseCycleQueryParam(cycleParam ?? "anual");

  return (
    <div className="mx-auto w-full max-w-xl space-y-[18px] px-4 py-6 md:py-12">
      <div className="flex justify-end">
        <Link
          href="/hoje"
          className="inline-flex min-h-11 items-center text-[15px] font-bold underline-offset-4 hover:underline"
        >
          Agora não
        </Link>
      </div>
      {recap && summary && lastDay ? (
        <>
          <section aria-labelledby="trial-title" className="space-y-2.5">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-brand-ink">
              {recap.phase === "active"
                ? `Seu teste termina ${longDayLabel(lastDay).toLocaleLowerCase("pt-BR")}`
                : "Seu teste terminou"}
            </p>
            <h1
              id="trial-title"
              className="text-[38px] font-extrabold leading-none tracking-display md:text-5xl"
            >
              Sua semana continua aqui.
            </h1>
            <p className="text-base leading-normal text-ink-soft">
              Foi isso que a sua casa fez{" "}
              {recap.phase === "active"
                ? daysSoFar <= 1
                  ? "neste primeiro dia"
                  : `nestes ${daysSoFar} dias`
                : `nos ${TRIAL_DAYS} dias`}
              :
            </p>
          </section>
          <ul className="grid grid-cols-2 gap-2.5">
            {STATS.map((stat) => {
              const value = summary[stat.key];
              return (
                <li
                  key={stat.key}
                  className="flex flex-col gap-0.5 rounded-2xl bg-card p-3.5 ring-1 ring-border"
                >
                  <span className="text-[30px] font-extrabold leading-none tracking-display">
                    {value}
                  </span>
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {value === 1 ? stat.one : stat.many}
                  </span>
                </li>
              );
            })}
          </ul>
          <ProOffer initialCycle={initialCycle} />
          <section aria-labelledby="free-title" className="space-y-2.5">
            <h2 id="free-title" className="font-bold">
              {recap.phase === "active"
                ? `Se não assinar, no dia ${dayOfMonth(lastDay)} a conta fica no Free:`
                : "Agora a conta está no Free:"}
            </h2>
            <p className="flex gap-2.5 text-[15px] leading-normal text-ink-soft">
              <Check
                className="mt-0.5 size-[18px] shrink-0 text-sage"
                strokeWidth={2.6}
                aria-hidden
              />
              Suas receitas, o modo cozinha e as listas que já existem continuam.
            </p>
            <p className="flex gap-2.5 text-[15px] leading-normal text-ink-soft">
              <Minus
                className="mt-0.5 size-[18px] shrink-0 text-brand-ink"
                strokeWidth={2.6}
                aria-hidden
              />
              Novas semanas e a ajuda da IA param. Receitas novas só até o acervo chegar a{" "}
              {FREE_RECIPE_LIMIT}.
            </p>
          </section>
        </>
      ) : (
        <>
          <ProOffer initialCycle={initialCycle} titleAs="h1" />
          <p className="text-[15px] leading-normal text-muted-foreground">
            Para a semana inteira: planejar, comprar e cozinhar, com {PRO_MONTHLY_CREDITS} créditos
            de IA por mês.
          </p>
        </>
      )}
    </div>
  );
}
