import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { BillingCycle } from "@/features/billing/plans-content";
import type { LandingPlacement } from "@/features/metrics/landing-schema";
import styles from "./sales.module.css";

export function SalesCta({
  placement,
  cycle,
  secondary = false,
}: {
  placement: LandingPlacement;
  cycle?: BillingCycle;
  secondary?: boolean;
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
      {cycle ? "Escolher o Pro" : "Organizar meu primeiro recado"}
      {!secondary && <ArrowRight size={19} aria-hidden="true" />}
    </Link>
  );
}
export function TrialNote() {
  return (
    <p className={[styles.fine, styles.heroCtaNote].join(" ")}>
      5 importações grátis por conta verificada. Sem cartão.
    </p>
  );
}
