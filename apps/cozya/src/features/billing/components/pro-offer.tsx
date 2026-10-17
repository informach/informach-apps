"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { recordOfferSeenAction } from "@/features/kitchen/event-actions";
import { startProCheckoutAction } from "@/features/onboarding/actions";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { ANNUAL_SAVINGS_PCT, type BillingCycle, PRICING, WHOLE_PRICES } from "../plans-content";

const CYCLES: Record<
  BillingCycle,
  { label: string; price: string; period: string; note: string; cta: string }
> = {
  monthly: {
    label: "Mensal",
    price: WHOLE_PRICES.monthly,
    period: "por mês",
    note: "Cobrado todo mês.",
    cta: "Assinar o Pro mensal",
  },
  annual: {
    label: `Anual · ${ANNUAL_SAVINGS_PCT}% a menos`,
    price: WHOLE_PRICES.annual,
    period: "por ano",
    note: `Equivale a ${PRICING.annual.price} por mês. Os 50 créditos chegam todo mês, também no anual.`,
    cta: "Assinar o Pro anual",
  },
};

/** The Pro, once: the cycle, the price as it is charged and one button to the checkout. */
export function ProOffer({
  initialCycle = "annual",
  titleAs: Title = "h2",
}: {
  initialCycle?: BillingCycle;
  titleAs?: "h1" | "h2";
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [pending, startTransition] = useTransition();
  const plan = CYCLES[cycle];
  useEffect(() => {
    void catchActionResult(() => recordOfferSeenAction({}));
  }, []);

  const subscribe = () =>
    startTransition(async () => {
      const result = await catchActionResult(() => startProCheckoutAction({ cycle }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível abrir o pagamento.", {
            description: "Atualize a página e tente novamente.",
          });
          return;
        }
        if (result.error.code === "PRO_NOT_CONFIGURED") {
          toast("O Pro ainda não está disponível.", {
            description: "Suas receitas e listas continuam aqui enquanto isso.",
          });
          return;
        }
        if (result.error.code === "ALREADY_SUBSCRIBED") {
          toast("Você já tem o Pro ativo.", {
            description: "Abrindo a página do plano para você gerenciar a assinatura.",
          });
          router.push("/settings/billing");
          return;
        }
        if (result.error.code === "UNAUTHORIZED") {
          router.push("/login");
          return;
        }
        toast.error("Não foi possível abrir o pagamento.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      window.location.href = result.value.url;
    });

  return (
    <section
      aria-labelledby="pro-offer-title"
      className="flex flex-col gap-3.5 rounded-[22px] border-2 border-primary bg-card p-[18px]"
    >
      <Title id="pro-offer-title" className="text-xl font-bold">
        Cozya Pro
      </Title>
      <fieldset className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] rounded-[14px] bg-muted p-1">
        <legend className="sr-only">Ciclo de cobrança</legend>
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={cycle === value}
            onClick={() => setCycle(value)}
            className={cn(
              "min-h-11 rounded-[10px] px-1.5 text-[15px] leading-tight font-bold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring max-[359px]:whitespace-normal",
              cycle === value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {CYCLES[value].label}
          </button>
        ))}
      </fieldset>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[44px] font-extrabold leading-none tracking-display">
          {plan.price}
        </span>
        <span className="text-[17px] font-bold text-muted-foreground">{plan.period}</span>
      </p>
      <p className="-mt-1.5 text-sm leading-snug text-muted-foreground">{plan.note}</p>
      <Button
        className="h-14 w-full rounded-2xl text-[17px] font-extrabold"
        disabled={pending}
        onClick={subscribe}
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {plan.cta}
      </Button>
      <p className="text-[13px] leading-snug text-muted-foreground">
        Semanas sem limite, lista do mercado, modo cozinha e 50 créditos de IA por mês. Cancele pela
        conta quando quiser.
      </p>
    </section>
  );
}
