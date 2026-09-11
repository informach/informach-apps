import { ArrowDown, ArrowRight, Utensils } from "lucide-react";
import Image from "next/image";
import { TrialCta } from "../trial-cta";

const MEALS = [
  { day: "SEG", name: "Macarrão com tomate e grão-de-bico", servings: 4 },
  { day: "TER", name: "Omelete de abobrinha", servings: 2 },
  { day: "QUA", name: "Arroz com lentilha e cenoura", servings: 4 },
];

export function Hero() {
  return (
    <section className="landing-shell landing-hero" id="inicio" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="landing-eyebrow">
          <span className="landing-dot" /> Sua semana à mesa
        </p>
        <h1 id="hero-title">
          Seu jantar resolvido antes de a fome chegar<span className="hero-period">.</span>
        </h1>
        <p className="hero-description">
          Escolha suas receitas, planeje jantares e marmitas e leve a lista pronta ao mercado. O
          Cozya organiza o caminho até a mesa.
        </p>
        <TrialCta id="primeiro-convite" />
        <a className="landing-text-link hero-demo-link" href="#como-funciona">
          <ArrowDown size={17} aria-hidden /> Explorar uma semana de exemplo
        </a>
      </div>
      <div className="hero-scene">
        <div className="hero-photo">
          <Image
            src="/marketing/jantar.webp"
            alt="Macarrão com tomate e grão-de-bico à mesa, com uma porção separada em uma marmita."
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1280px) 52vw, 650px"
            preload
          />
          <span className="hero-photo-note">
            <Utensils size={14} aria-hidden /> Comida de casa. Rotina mais leve.
          </span>
        </div>
        <div className="hero-plan">
          <div className="hero-plan-header">
            <div>
              <span className="landing-mini-label">EXEMPLO DE USO</span>
              <h2>Minha semana</h2>
            </div>
            <span className="hero-plan-badge">3 refeições</span>
          </div>
          <ul>
            {MEALS.map((meal) => (
              <li key={meal.day}>
                <span className="hero-plan-day">
                  {meal.day}
                  <small>Jantar</small>
                </span>
                <span className="hero-plan-recipe">{meal.name}</span>
                <span className="hero-plan-portions">
                  {meal.servings}
                  <small>porções</small>
                </span>
              </li>
            ))}
          </ul>
          <a className="landing-button landing-button-navy" href="#como-funciona">
            Explorar minha semana <ArrowRight size={17} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
