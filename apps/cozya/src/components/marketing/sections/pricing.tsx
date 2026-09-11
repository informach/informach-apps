import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import {
  ANNUAL_SAVINGS,
  ANNUAL_SAVINGS_PCT,
  ANNUAL_TOTAL,
  PRICING,
} from "@/features/billing/plans-content";
import { TrialCta } from "../trial-cta";

const FEATURES = [
  "Planejamento semanal com porções e marmitas",
  "Lista de compras por ingredientes compatíveis",
  "Repetição da semana e preparo em etapas",
  "Receitas ilimitadas no seu acervo",
  "Captura, pesquisa e adaptação com IA",
  "50 créditos de IA renovados a cada mês",
];

export function Pricing() {
  return (
    <section id="planos" className="pricing-section" aria-labelledby="pricing-title">
      <div className="landing-shell">
        <div className="pricing-intro">
          <p className="landing-eyebrow">Um lugar na sua rotina</p>
          <h2 className="landing-title" id="pricing-title">
            Experimente na sua semana.
            <br />
            Continue com o que faz sentido.
          </h2>
          <p className="landing-description">
            Crie sua conta, verifique o e-mail e ative seu teste gratuito. Depois, escolha como quer
            continuar.
          </p>
          <TrialCta />
        </div>
        <div className="pricing-grid">
          <article className="landing-plan" aria-labelledby="monthly-plan-title">
            <div className="plan-heading">
              <span className="landing-mini-label">PARA IR NO SEU RITMO</span>
              <h3 id="monthly-plan-title">Cozya Pro mensal</h3>
            </div>
            <p className="plan-price">
              {PRICING.monthly.price}
              <span>/mês</span>
            </p>
            <p className="plan-billing-note">Cobrado mensalmente.</p>
            <p className="plan-caption">A organização da semana, mês a mês.</p>
            <ul>
              {FEATURES.map((feature) => (
                <li key={feature}>
                  <Check size={17} aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              className="landing-button landing-button-outline"
              href="/signup?plan=pro&cycle=mensal"
            >
              Assinar mensal <ArrowRight size={18} aria-hidden />
            </Link>
          </article>
          <article className="landing-plan landing-plan-annual" aria-labelledby="annual-plan-title">
            <div className="plan-heading">
              <span className="plan-value-badge">Melhor valor no ano</span>
              <h3 id="annual-plan-title">Cozya Pro anual</h3>
            </div>
            <p className="plan-price">
              {ANNUAL_TOTAL}
              <span>/ano</span>
            </p>
            <p className="plan-billing-note">
              Cobrado anualmente. Equivale a ≈ {PRICING.annual.price}/mês.
            </p>
            <p className="plan-caption">
              Economize {ANNUAL_SAVINGS} em relação a 12 mensalidades (≈ {ANNUAL_SAVINGS_PCT}%).
            </p>
            <ul>
              {FEATURES.map((feature) => (
                <li key={feature}>
                  <Check size={17} aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              className="landing-button landing-button-primary"
              href="/signup?plan=pro&cycle=anual"
            >
              Assinar anual <ArrowRight size={18} aria-hidden />
            </Link>
          </article>
        </div>
        <p className="pricing-credit-note">
          Cada tarefa concluída de IA usa 1 crédito. Cadastro manual, planejamento e preparo não
          consomem créditos. No anual, os 50 créditos também são renovados mensalmente.
        </p>
        <div className="pricing-free">
          <div>
            <span className="landing-mini-label">COZYA FREE · R$ 0</span>
            <h3>Seu caderno também pode começar grátis.</h3>
            <p>
              Cadastre até 15 receitas. Depois do teste, seu acervo, o modo de preparo e as listas
              já criadas continuam acessíveis. Novos planejamentos ficam no Pro.
            </p>
          </div>
          <Link href="/signup" className="landing-text-link">
            Começar pelo Free <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
