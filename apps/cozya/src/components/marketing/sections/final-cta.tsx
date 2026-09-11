import { ArrowUpRight, Utensils } from "lucide-react";
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="landing-shell final-cta-section" aria-labelledby="final-title">
      <div className="final-cta">
        <span className="final-cta-symbol">
          <Utensils size={28} aria-hidden />
        </span>
        <p className="landing-eyebrow">Sua semana à mesa</p>
        <h2 id="final-title">
          Deixe os próximos
          <br />
          jantares encaminhados.
        </h2>
        <p>
          Escolha uma receita que você gosta.
          <br />
          Monte suas primeiras refeições. Leve a lista com você.
        </p>
        <Link href="/signup" className="landing-button landing-button-primary">
          Planejar minha semana grátis <ArrowUpRight size={20} aria-hidden />
        </Link>
        <p className="final-cta-terms">
          14 dias de planejamento + 3 créditos de IA.
          <br />
          Sem cartão. Sem renovação automática.
        </p>
      </div>
    </section>
  );
}
