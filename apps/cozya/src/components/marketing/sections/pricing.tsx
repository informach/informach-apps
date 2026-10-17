import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import {
  ANNUAL_SAVINGS,
  ANNUAL_SAVINGS_PCT,
  ANNUAL_TOTAL,
  PRICING,
} from "@/features/billing/plans-content";

const PRO = [
  "Semanas sem limite, com mesa e marmitas",
  "Lista do mercado somada, com despensa",
  "Modo cozinha e repetir a semana",
  "Receitas sem limite",
  "50 créditos de IA por mês, também no anual",
];

const FREE = [
  "Até 15 receitas escritas do seu jeito",
  "Modo cozinha em todas as suas receitas",
  "As semanas e listas que você já montou",
  "Compartilhar receita pelo WhatsApp",
];

export function Pricing() {
  return (
    <section id="planos" className="pricing-section" aria-labelledby="pricing-title">
      <div className="landing-shell landing-section">
        <div className="pricing-intro">
          <p className="landing-eyebrow">Planos</p>
          <h2 className="landing-title" id="pricing-title">
            Comece grátis. Fique se a semana ficar mais leve.
          </h2>
        </div>
        <ol className="pricing-steps">
          <li>
            <span>Na primeira semana</span>
            <strong>14 dias para planejar</strong>
            <p>Semana, lista, modo cozinha e 3 créditos de IA, com até 15 receitas. Sem cartão.</p>
          </li>
          <li>
            <span>Depois de 14 dias</span>
            <strong>Sem assinar, vira Free</strong>
            <p>Suas receitas, o preparo e as listas ficam. Novas semanas e a IA ficam no Pro.</p>
          </li>
          <li>
            <span>Quando quiser</span>
            <strong>Assina o Pro</strong>
            <p>E cancela pela conta quando quiser. O Pro vai até o fim do período pago.</p>
          </li>
        </ol>
        <div className="pricing-grid">
          <article className="landing-plan landing-plan-pro" aria-labelledby="pro-title">
            <h3 id="pro-title">Cozya Pro</h3>
            <div className="plan-options">
              <div className="plan-option">
                <span className="plan-option-label">Mensal</span>
                <p className="plan-price">
                  {PRICING.monthly.price}
                  <span className="plan-period">/mês</span>
                </p>
                <p className="plan-billing-note">Cobrado todo mês.</p>
                <Link
                  className="landing-button landing-button-outline"
                  href="/signup?plan=pro&cycle=mensal"
                >
                  Assinar o Pro mensal
                </Link>
              </div>
              <div className="plan-option plan-option-best">
                <span className="plan-option-label">
                  Anual <em>economize {ANNUAL_SAVINGS_PCT}%</em>
                </span>
                <p className="plan-price">
                  {ANNUAL_TOTAL}
                  <span className="plan-period">/ano</span>
                </p>
                <p className="plan-billing-note">
                  Equivale a {PRICING.annual.price} por mês: {ANNUAL_SAVINGS} a menos que 12
                  mensalidades.
                </p>
                <Link
                  className="landing-button landing-button-primary"
                  href="/signup?plan=pro&cycle=anual"
                >
                  Assinar o Pro anual
                </Link>
              </div>
            </div>
            <ul>
              {PRO.map((feature) => (
                <li key={feature}>
                  <Check size={17} aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="landing-plan landing-plan-free" aria-labelledby="free-title">
            <h3 id="free-title">Cozya Free</h3>
            <p className="plan-price">R$ 0</p>
            <p className="plan-billing-note">
              É onde a conta fica se você não assinar depois do teste.
            </p>
            <ul>
              {FREE.map((feature) => (
                <li key={feature}>
                  <Check size={17} aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="landing-button landing-button-outline">
              Começar grátis <ArrowRight size={18} aria-hidden />
            </Link>
          </article>
        </div>
        <p className="pricing-credit-note">
          Cada receita que a IA traz, encontra ou adapta usa 1 crédito, e ditar uma busca também; se
          a IA não conseguir, o crédito volta. Escrever do seu jeito, planejar, montar a lista e
          cozinhar não usam créditos.
        </p>
      </div>
    </section>
  );
}
