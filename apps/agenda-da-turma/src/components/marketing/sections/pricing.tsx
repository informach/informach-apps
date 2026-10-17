"use client";

import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Minus } from "lucide-react";
import { useState } from "react";
import {
  type BillingCycle,
  FREE_FEATURES,
  FREE_TRIAL_READS,
  type PlanFeature,
  PRICING,
  PRO_FEATURES,
  SMALLEST_PACK_PRICE,
} from "@/features/billing/plans-content";
import { EYEBROW, H2, SEC, SEC_LIGHT, SHEET, WRAP } from "../landing-ui";
import { SalesCta } from "../sales-cta";

const TRIAL_WORDS: Record<number, string> = { 3: "três", 4: "quatro", 5: "cinco", 6: "seis" };

function Features({ items }: { items: PlanFeature[] }) {
  return (
    <ul className="flex flex-col gap-3 text-base leading-[1.45]">
      {items.map((feature) => (
        <li
          key={feature.label}
          className={cn("flex gap-2.5", !feature.included && "text-muted-foreground")}
        >
          {/* O traço do que não está incluído é desenhado, e não um caractere de
              travessão: a página não leva travessão no texto. */}
          {feature.included ? (
            <b aria-hidden className="text-chart-2-ink">
              ✓
            </b>
          ) : (
            <Minus aria-hidden className="mt-[3px] size-4 shrink-0" strokeWidth={2.5} />
          )}
          <span>
            {feature.label}
            {feature.included ? null : <span className="sr-only"> (não incluído)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Os dois planos, como na prancha: o ciclo num seletor no meio e os dois cartões lado a lado. */
export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  // O seletor só troca o preço depois da hidratação: antes dela, num celular
  // lento, o toque se perderia e a página continuaria no mensal sem dizer nada.
  const hydrated = useHydrated();
  const price = PRICING[cycle];
  return (
    <section id="planos" aria-labelledby="pricing-title" className={`${SEC} ${SEC_LIGHT}`}>
      <div className={`${WRAP} flex flex-col items-center gap-10`}>
        <div className="flex max-w-[720px] flex-col items-center gap-4 text-center">
          <p className={EYEBROW}>Planos</p>
          <h2 id="pricing-title" className={H2}>
            Experimente com {TRIAL_WORDS[FREE_TRIAL_READS] ?? FREE_TRIAL_READS} recados. Fique se a
            semana melhorar.
          </h2>
        </div>
        <fieldset className="flex gap-1 rounded-[14px] bg-card p-1">
          <legend className="sr-only">Ciclo de cobrança</legend>
          {(["monthly", "annual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={cycle === option}
              disabled={!hydrated}
              onClick={() => setCycle(option)}
              className={cn(
                "min-h-11 rounded-[11px] px-4 text-[15px] font-bold",
                cycle === option
                  ? "bg-background text-foreground shadow-[0_1px_0_var(--line-solid)]"
                  : "text-foreground/75 hover:text-foreground",
              )}
            >
              {PRICING[option].tabLabel}
            </button>
          ))}
        </fieldset>
        <div className="grid w-full max-w-[960px] grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-5">
          <article className={cn(SHEET, "flex flex-col gap-[18px] bg-app-ground p-8")}>
            <div>
              <h3 className="text-[22px] font-bold">Grátis</h3>
              <p className="mt-1.5 text-base text-muted-foreground">
                Para experimentar com uma criança.
              </p>
            </div>
            <p className="text-[52px] font-extrabold leading-tight tracking-[-0.04em]">R$ 0</p>
            <Features items={FREE_FEATURES} />
            <SalesCta
              placement="pricing"
              secondary
              label="Começar com um recado"
              className="mt-auto"
            />
          </article>
          <article className={cn(SHEET, "flex flex-col gap-[18px] border-2 border-primary p-8")}>
            <div>
              <h3 className="text-[22px] font-bold">Pro</h3>
              <p className="mt-1.5 text-base text-muted-foreground">
                Para a casa inteira acompanhar junto.
              </p>
            </div>
            <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2.5">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-[52px] font-extrabold leading-tight tracking-[-0.04em]">
                  {price.price}
                </span>
                <span className="text-lg text-muted-foreground">{price.periodWords}</span>
              </p>
              <p className="-mt-2 text-[15px] text-foreground/80">{price.landingNote}</p>
            </div>
            <Features items={PRO_FEATURES} />
            <SalesCta placement="pricing" cycle={cycle} className="mt-auto" />
            <p className="text-sm leading-normal text-muted-foreground">
              Cancele quando quiser. O que já está na Agenda continua lá para consultar.
              {SMALLEST_PACK_PRICE
                ? ` Se as leituras acabarem antes do fim do mês, dá para comprar mais a partir de ${SMALLEST_PACK_PRICE}.`
                : ""}
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
