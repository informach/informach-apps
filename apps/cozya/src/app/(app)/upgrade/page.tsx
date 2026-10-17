import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { ProOffer } from "@/features/billing/components/pro-offer";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { getKitchenAccess } from "@/features/kitchen/access";
import { addDays, localDay, longDayLabel } from "@/features/kitchen/dates";
import { getTrialSummary } from "@/features/kitchen/repository";
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
  const trialStart = access.profile?.trialStartedAt ?? null;
  const summary = trialStart && !access.isPro ? await getTrialSummary(user.id, trialStart) : null;
  const endsAt = access.trialEndsAt;
  const days = trialStart
    ? Math.max(1, Math.ceil((Date.now() - trialStart.getTime()) / 86400000))
    : 0;
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
      {summary ? (
        <>
          <section aria-labelledby="trial-title" className="space-y-2.5">
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
            <p className="text-base leading-normal text-ink-soft">
              Foi isso que a sua casa fez{" "}
              {access.trialActive
                ? days <= 1
                  ? "neste primeiro dia"
                  : `nestes ${Math.min(days, 14)} dias`
                : "nos 14 dias"}
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
              {access.trialActive && endsAt
                ? `Se não assinar, no dia ${dayOfMonth(addDays(localDay(endsAt), 1))} a conta fica no Free:`
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
              Novas semanas e a ajuda da IA param. Receitas novas só até o acervo chegar a 15.
            </p>
          </section>
        </>
      ) : (
        <>
          <ProOffer initialCycle={initialCycle} titleAs="h1" />
          <p className="text-[15px] leading-normal text-muted-foreground">
            Para a semana inteira: planejar, comprar e cozinhar, com 50 créditos de IA por mês.
          </p>
        </>
      )}
    </div>
  );
}
