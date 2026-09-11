import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function TrialCta({ id }: { id?: string }) {
  return (
    <div className="landing-trial" id={id}>
      <Link href="/signup" className="landing-button landing-button-primary">
        Planejar minha semana grátis <ArrowUpRight size={20} aria-hidden />
      </Link>
      <p>
        14 dias de planejamento + 3 créditos de IA.
        <br />
        Sem cartão. Sem renovação automática.
      </p>
    </div>
  );
}
