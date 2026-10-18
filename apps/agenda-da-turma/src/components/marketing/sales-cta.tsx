import { cn } from "@informach/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type BillingCycle, FREE_TRIAL_READS } from "@/features/billing/plans-content";
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
    ? `/signup?plan=pro&cycle=${cycle === "annual" ? "anual" : "mensal"}`
    : "/signup";
  return (
    <Link
      href={href}
      className={cn(secondary ? BTN2 : BTN, className)}
      data-landing-action="cta"
      data-landing-placement={placement}
      data-landing-plan={cycle ? "pro" : "free"}
      data-landing-cycle={cycle}
    >
      {label ?? (cycle ? "Assinar o Pro" : "Organizar meu primeiro recado")}
      {arrow ? <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden /> : null}
    </Link>
  );
}

export function TrialNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[15px] text-muted-foreground", className)}>
      Os {FREE_TRIAL_READS} primeiros recados são por nossa conta. Sem cartão.
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
