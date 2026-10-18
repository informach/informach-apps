import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/features/kitchen/trial";

export function TrialCta({ id, tone = "paper" }: { id?: string; tone?: "paper" | "navy" }) {
  return (
    <div className={`landing-trial landing-trial-${tone}`} id={id}>
      <Link href="/signup" className="landing-button landing-button-primary">
        Montar minha semana grátis <ArrowRight size={20} aria-hidden />
      </Link>
      <p>{TRIAL_DAYS} dias grátis, sem cartão. Não vira assinatura sozinho.</p>
    </div>
  );
}
