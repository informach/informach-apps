import { cn } from "@informach/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type BillingCycle, TRIAL_CREDITS, TRIAL_DAYS } from "@/features/billing/plans-content";
import type { LandingPlacement } from "@/features/metrics/landing-schema";
import { BTN, BTN2 } from "./landing-ui";
import styles from "./sales.module.css";

/**
 * O botão de começar. Leva as marcas que o `LandingTracker` lê para contar o
 * primeiro clique por lugar da página, e nada além disso.
 */
export function SalesCta({
  placement,
  cycle,
  secondary = false,
  arrow,
  label,
  className,
}: {
  placement: LandingPlacement;
  cycle?: BillingCycle;
  secondary?: boolean;
  /** A seta do botão principal, como no topo da prancha. */
  arrow?: boolean;
  label?: string;
  className?: string;
}) {
  const href = cycle
    ? (`/login?next=${encodeURIComponent(`/upgrade?cycle=${cycle === "annual" ? "anual" : "mensal"}`)}` as const)
    : "/signup";
  return (
    <Link
      href={href}
      className={cn(secondary ? BTN2 : BTN, className)}
      data-landing-action="cta"
      data-landing-placement={placement}
      data-landing-plan={cycle ? "compasso" : "free"}
      data-landing-cycle={cycle}
    >
      {label ?? (cycle ? "Conhecer o Compasso" : "Organizar meu primeiro recado")}
      {arrow ? <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden /> : null}
    </Link>
  );
}

export function TrialNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[15px] text-muted-foreground", className)}>
      Teste o Compasso por {TRIAL_DAYS} dias, com {TRIAL_CREDITS} créditos de IA compartilhados. Sem
      cartão.
    </p>
  );
}

/** No celular, o começar fica sempre a um toque, flutuando no pé da tela. */
export function StickyCta() {
  return (
    <div className={styles.sticky}>
      <SalesCta placement="sticky" className="w-full" />
    </div>
  );
}
