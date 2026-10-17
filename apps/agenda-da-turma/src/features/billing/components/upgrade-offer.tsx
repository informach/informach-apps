"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startProCheckoutAction } from "@/features/onboarding/actions";
import { proOfferHref } from "@/features/onboarding/signup-flow";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { type BillingCycle, PRICING, PRO_FEATURES } from "../plans-content";

/**
 * O Pro na hora certa: o cartão de assinatura de `/upgrade`.
 *
 * Quem chega aqui acabou de esbarrar em alguma coisa (os recados de teste
 * acabaram, a segunda criança, o segundo adulto, a semana para imprimir), e a
 * página abre dizendo o quê, em vez de uma tabela de planos. O título e a
 * frase vêm da página; aqui ficam o ciclo, o preço e o botão.
 */
export function UpgradeOffer({
  title,
  description,
  initialCycle,
}: {
  title: string;
  description: string;
  initialCycle: BillingCycle;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [pending, startTransition] = useTransition();
  const price = PRICING[cycle];

  const subscribe = () =>
    startTransition(async () => {
      const result = await catchActionResult(() => startProCheckoutAction({ cycle }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("O pagamento não abriu.", {
            description: "Atualize a página e tente de novo.",
          });
          return;
        }
        if (result.error.code === "ALREADY_SUBSCRIBED") {
          toast("Vocês já têm o Pro.", { description: "Abrindo a assinatura." });
          router.push("/settings/billing");
          return;
        }
        if (result.error.code === "UNAUTHORIZED") {
          // A sessão venceu na oferta: o login volta para ela no mesmo ciclo.
          router.push(`/login?next=${encodeURIComponent(proOfferHref(cycle))}`);
          return;
        }
        toast.error("O pagamento não abriu.", { description: "Tente de novo em instantes." });
        return;
      }
      window.location.href = result.value.url;
    });

  return (
    <div className="w-full max-w-md space-y-5">
      <header className="space-y-2">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      </header>

      <section
        aria-labelledby="upgrade-plan-title"
        className="space-y-4 rounded-[20px] border border-foreground/15 bg-background p-5"
      >
        <h2 id="upgrade-plan-title" className="sr-only">
          Pro
        </h2>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Como pagar</legend>
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
        <div aria-live="polite" aria-atomic="true">
          <p className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold tracking-tight">{price.price}</span>
            <span className="text-sm text-muted-foreground">{price.period}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{price.note}</p>
        </div>
        <ul className="space-y-2.5">
          {PRO_FEATURES.map((feature) => (
            <li key={feature.label} className="flex items-start gap-2.5 text-[15px]">
              <Check className="mt-0.5 size-4 shrink-0 text-chart-2-ink" aria-hidden />
              {feature.label}
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          className="min-h-12 w-full rounded-xl text-base font-extrabold shadow-solid-primary"
          onClick={subscribe}
          disabled={pending}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Assinar o Pro
        </Button>
        <p className="text-center text-sm text-muted-foreground">Cancele quando quiser.</p>
      </section>

      <section className="space-y-1 text-[15px]">
        <p className="font-bold">Prefere continuar no grátis?</p>
        <p className="text-muted-foreground">
          Escrever à mão continua livre, e tudo o que já está na Agenda fica onde está.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center font-bold text-primary-ink"
        >
          Voltar para Hoje
        </Link>
      </section>
    </div>
  );
}
