"use client";

import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startProCheckoutAction } from "@/features/onboarding/actions";
import { proOfferHref } from "@/features/onboarding/signup-flow";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { type BillingCycle, PRICING, PRO_OFFER_FEATURES } from "../plans-content";

/**
 * O Pro na hora certa: a tela de assinar de `/upgrade`.
 *
 * Quem chega aqui acabou de esbarrar em alguma coisa (os recados de teste
 * acabaram, a segunda criança, o segundo adulto, a semana para imprimir), e a
 * página abre dizendo o quê, em vez de uma tabela de planos. O título e a
 * frase vêm da página; aqui ficam o ciclo, o preço e o botão.
 *
 * O desenho é o do canvas: o "X" para sair, o título grande, o cartão do Pro
 * com borda azul e o ciclo num seletor de duas partes, e o grátis numa frase
 * só, com a volta para Hoje.
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
    <div data-immersive className="flex w-full max-w-md flex-col gap-4">
      <Link
        href="/dashboard"
        aria-label="Fechar"
        className="-ml-1 flex size-11 items-center justify-center rounded-xl hover:bg-muted"
      >
        <X className="size-6" aria-hidden />
      </Link>

      <header className="flex flex-col gap-2.5 px-1">
        <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-[-0.04em]">{title}</h1>
        <p className="text-base leading-normal text-foreground/80">{description}</p>
      </header>

      <section
        aria-labelledby="upgrade-plan-title"
        className="flex flex-col gap-3.5 rounded-[22px] border-2 border-primary bg-background p-5"
      >
        <h2 id="upgrade-plan-title" className="sr-only">
          Pro
        </h2>
        <fieldset className="flex gap-1 rounded-xl bg-card p-1">
          <legend className="sr-only">Como pagar</legend>
          {(["monthly", "annual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={cycle === option}
              onClick={() => setCycle(option)}
              className={cn(
                "min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] flex-1 rounded-[9px] px-2 text-sm font-bold leading-tight",
                cycle === option ? "bg-background" : "text-foreground/75 hover:text-foreground",
              )}
            >
              {PRICING[option].shortTabLabel}
            </button>
          ))}
        </fieldset>
        <div aria-live="polite" aria-atomic="true">
          <p className="flex items-baseline gap-2">
            <span className="text-[40px] font-extrabold leading-tight tracking-[-0.04em]">
              {price.price}
            </span>
            <span className="text-base text-muted-foreground">{price.periodWords}</span>
          </p>
          {/* O anual é cobrado de uma vez: a conta do ano precisa estar à vista
              antes do pagamento. O mensal se explica sozinho, como no canvas. */}
          {cycle === "annual" ? (
            <p className="mt-1 text-sm text-muted-foreground">{price.note}</p>
          ) : null}
        </div>
        <ul className="flex flex-col gap-2.5">
          {PRO_OFFER_FEATURES.map((feature) => (
            <li key={feature.label} className="flex gap-2.5 text-[15px] leading-[1.45]">
              <span aria-hidden className="font-bold text-chart-2-ink">
                ✓
              </span>
              {feature.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground shadow-solid-primary disabled:opacity-60"
          onClick={subscribe}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Assinar o Pro
        </button>
        <p className="text-center text-[13px] text-muted-foreground">Cancele quando quiser.</p>
      </section>

      <p className="px-1 text-[15px] leading-normal text-foreground/80">
        <b className="text-foreground">Prefere continuar no grátis?</b> Escrever à mão continua
        livre, e tudo o que já está na Agenda fica onde está.{" "}
        <Link href="/dashboard" className="font-bold text-primary-ink underline">
          Voltar para Hoje
        </Link>
      </p>
    </div>
  );
}
