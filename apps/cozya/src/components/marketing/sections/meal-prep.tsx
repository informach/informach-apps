import { Plus } from "lucide-react";
import Image from "next/image";
import { LunchboxIcon } from "@/components/brand/lunchbox-icon";

export function MealPrep() {
  return (
    <section
      className="landing-shell landing-section meal-prep-grid"
      aria-labelledby="meal-prep-title"
    >
      <div className="meal-prep-photo">
        <Image
          src="/marketing/marmitas.webp"
          alt="Dois pratos de arroz com lentilha e legumes assados e duas porções em marmitas de vidro."
          fill
          sizes="(max-width: 767px) 100vw, 50vw"
        />
        <div className="meal-prep-equation">
          <span className="chip">2 na mesa</span>
          <Plus size={16} aria-hidden />
          <span className="chip tag-peach">
            <LunchboxIcon width={15} height={15} /> 2 marmitas
          </span>
          <strong>4 porções</strong>
        </div>
      </div>
      <div className="meal-prep-copy">
        <p className="landing-eyebrow">Cabe na vida de verdade</p>
        <h2 className="landing-title" id="meal-prep-title">
          Jantar de hoje. <span className="title-sage">Marmita de amanhã.</span>
        </h2>
        <p className="landing-description">
          Diga quantos comem e quantas marmitas quer. O Cozya soma as porções, ajusta as quantidades
          que dá para calcular e, no dia seguinte, o Hoje lembra que o almoço já está pronto.
        </p>
      </div>
    </section>
  );
}
