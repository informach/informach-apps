import { ArrowUpRight, Plus } from "lucide-react";
import Image from "next/image";

export function MealPrep() {
  return (
    <section className="meal-prep-section" aria-labelledby="meal-prep-title">
      <div className="landing-shell meal-prep-grid">
        <div className="meal-prep-photo">
          <Image
            src="/marketing/marmitas.webp"
            alt="Duas refeições servidas em pratos e duas porções separadas em marmitas de vidro."
            fill
            sizes="(max-width: 767px) 100vw, 50vw"
          />
          <div className="meal-prep-equation">
            <span>
              <strong>2</strong> para o jantar
            </span>
            <Plus size={18} aria-hidden />
            <span>
              <strong>2</strong> para levar
            </span>
            <span className="meal-prep-total">4 porções</span>
          </div>
        </div>
        <div className="meal-prep-copy">
          <p className="landing-eyebrow">Cabe na vida de verdade</p>
          <h2 className="landing-title" id="meal-prep-title">
            Jantar de hoje.
            <br />
            <span>Marmita de amanhã.</span>
          </h2>
          <p className="landing-description">
            Vai cozinhar para dois e separar duas marmitas? Planeje quatro porções. O Cozya ajusta
            as quantidades calculáveis da receita e leva os ingredientes para a lista de compras.
          </p>
          <p className="meal-prep-note">
            Uma decisão de hoje pode deixar outra refeição encaminhada.
          </p>
          <a href="#como-funciona" className="landing-text-link">
            Experimentar o ajuste de porções <ArrowUpRight size={18} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
