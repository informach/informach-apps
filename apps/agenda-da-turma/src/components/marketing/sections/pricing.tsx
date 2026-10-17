"use client";

import { cn } from "@informach/ui/lib/utils";
import { Check, Minus } from "lucide-react";
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
import styles from "../sales.module.css";
import { SalesCta } from "../sales-cta";

const TRIAL_WORDS: Record<number, string> = { 3: "três", 4: "quatro", 5: "cinco", 6: "seis" };

function Features({ items }: { items: PlanFeature[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((feature) => (
        <li
          key={feature.label}
          className={cn(
            "flex items-start gap-2.5 text-[15px] leading-snug",
            !feature.included && "text-muted-foreground",
          )}
        >
          {feature.included ? (
            <Check className="mt-0.5 size-4 shrink-0 text-chart-2-ink" aria-hidden />
          ) : (
            <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
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

export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const price = PRICING[cycle];
  return (
    <section
      id="planos"
      aria-labelledby="pricing-title"
      className="scroll-mt-6 border-y border-foreground/15 bg-muted/40 py-16 md:py-24"
    >
      <div className={[styles.wrap, "space-y-8"].join(" ")}>
        <div className="space-y-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
            Planos
          </p>
          <h2
            id="pricing-title"
            className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
          >
            Experimente com {TRIAL_WORDS[FREE_TRIAL_READS] ?? FREE_TRIAL_READS} recados. Fique se a
            semana melhorar.
          </h2>
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Como pagar o Pro</legend>
          {(["monthly", "annual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={cycle === option}
              onClick={() => setCycle(option)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold",
                cycle === option
                  ? "bg-foreground text-background"
                  : "border border-foreground/15 bg-background hover:bg-muted",
              )}
            >
              {PRICING[option].tabLabel}
            </button>
          ))}
        </fieldset>
        <div className="grid gap-5 md:grid-cols-2">
          <article className="flex flex-col gap-5 rounded-[20px] border border-foreground/15 bg-background p-6">
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold tracking-tight">Grátis</h3>
              <p className="text-[15px] text-muted-foreground">
                Para experimentar com uma criança.
              </p>
            </div>
            <p className="text-4xl font-extrabold tracking-tight">R$ 0</p>
            <Features items={FREE_FEATURES} />
            <div className="mt-auto">
              <SalesCta placement="pricing" secondary label="Começar com um recado" />
            </div>
          </article>
          <article className="flex flex-col gap-5 rounded-[20px] border-2 border-primary/50 bg-background p-6">
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold tracking-tight">Pro</h3>
              <p className="text-[15px] text-muted-foreground">
                Para a casa inteira acompanhar junto.
              </p>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <p className="flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-tight">{price.price}</span>
                <span className="text-sm text-muted-foreground">{price.period}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{price.note}</p>
            </div>
            <Features items={PRO_FEATURES} />
            <div className="mt-auto">
              <SalesCta placement="pricing" cycle={cycle} />
            </div>
          </article>
        </div>
        <p className="max-w-[46rem] text-sm text-muted-foreground">
          Cancele quando quiser. O que já está na Agenda continua lá para consultar.
          {SMALLEST_PACK_PRICE
            ? ` Se as leituras acabarem antes do fim do mês, dá para comprar mais a partir de ${SMALLEST_PACK_PRICE}.`
            : ""}
        </p>
      </div>
    </section>
  );
}
