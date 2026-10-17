import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type BillingCycle, FREE_TRIAL_READS } from "@/features/billing/plans-content";
import type { LandingPlacement } from "@/features/metrics/landing-schema";
import styles from "./sales.module.css";

/**
 * O botão de começar. Leva as marcas que o `LandingTracker` lê para contar o
 * primeiro clique por lugar da página, e nada além disso.
 */
export function SalesCta({
  placement,
  cycle,
  secondary = false,
  label,
}: {
  placement: LandingPlacement;
  cycle?: BillingCycle;
  secondary?: boolean;
  label?: string;
}) {
  const href = cycle
    ? `/signup?plan=pro&cycle=${cycle === "annual" ? "anual" : "mensal"}`
    : "/signup";
  return (
    <Link
      href={href}
      className={[styles.button, secondary && styles.secondary].filter(Boolean).join(" ")}
      data-landing-action="cta"
      data-landing-placement={placement}
      data-landing-plan={cycle ? "pro" : "free"}
      data-landing-cycle={cycle}
    >
      {label ?? (cycle ? "Assinar o Pro" : "Organizar meu primeiro recado")}
      {!secondary && <ArrowRight size={19} aria-hidden="true" />}
    </Link>
  );
}

export function TrialNote({ className }: { className?: string }) {
  return (
    <p className={["text-sm text-muted-foreground", className].filter(Boolean).join(" ")}>
      Os {FREE_TRIAL_READS} primeiros recados são por nossa conta. Sem cartão.
    </p>
  );
}

/** No celular, o começar fica sempre a um toque, no pé da tela. */
export function StickyCta() {
  return (
    <div className={styles.sticky}>
      <SalesCta placement="sticky" />
    </div>
  );
}
