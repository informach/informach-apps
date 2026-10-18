import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import {
  ANNUAL_SAVINGS,
  ANNUAL_SAVINGS_PCT,
  PRICING,
  PRO_MONTHLY_CREDITS,
  WHOLE_PRICES,
} from "@/features/billing/plans-content";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/features/kitchen/trial";
import { FREE_RECIPE_LIMIT } from "@/features/recipes/limits";

const PRO = [
  "Semana com mesa e marmitas, quantas semanas quiser",
  "Lista do mercado somada, com despensa",
  "Modo cozinha e repetir a semana",
  "Receitas sem limite",
  `${PRO_MONTHLY_CREDITS} créditos de IA por mês, também no anual. Cada receita trazida, encontrada ou adaptada usa 1.`,
];

const FREE = [
  `Até ${FREE_RECIPE_LIMIT} receitas escritas do seu jeito`,
  "Modo cozinha em todas as suas receitas",
  "As semanas e listas que você já montou",
  "Mandar receita pelo WhatsApp",
];

const CYCLES = [
  {
    value: "anual",
    price: WHOLE_PRICES.annual,
    period: "por ano",
    note: `Equivale a ${PRICING.annual.price} por mês. Você economiza ${ANNUAL_SAVINGS} em relação a 12 mensalidades.`,
    cta: "Assinar o Pro anual",
  },
  {
    value: "mensal",
    price: WHOLE_PRICES.monthly,
    period: "por mês",
    note: "Cobrado todo mês. Cancele pela conta quando quiser.",
    cta: "Assinar o Pro mensal",
  },
] as const;

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul>
      {items.map((feature) => (
        <li key={feature}>
          <Check size={18} strokeWidth={2.6} aria-hidden />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

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
            <strong>{TRIAL_DAYS} dias para planejar</strong>
            <p>
              Semana, lista, modo cozinha e {TRIAL_CREDITS} créditos de IA, com até{" "}
              {FREE_RECIPE_LIMIT} receitas. Sem cartão.
            </p>
          </li>
          <li>
            <span>Depois de {TRIAL_DAYS} dias</span>
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
          {/* Native radios switch the cycle, so the offer also works without JavaScript. */}
          <article className="landing-plan landing-plan-pro" aria-labelledby="pro-title">
            <div className="plan-head">
              <h3 id="pro-title">Cozya Pro</h3>
              <fieldset className="plan-cycle">
                <legend className="sr-only">Ciclo de cobrança</legend>
                <label>
                  <input type="radio" name="ciclo-pro" value="mensal" />
                  Mensal
                </label>
                <label>
                  <input type="radio" name="ciclo-pro" value="anual" defaultChecked />
                  Anual · economize {ANNUAL_SAVINGS_PCT}%
                </label>
              </fieldset>
            </div>
            {CYCLES.map((cycle) => (
              <div key={cycle.value} className="plan-cycle-price" data-cycle={cycle.value}>
                <p className="plan-price">
                  {cycle.price}
                  <span className="plan-period">{cycle.period}</span>
                </p>
                <p className="plan-billing-note">{cycle.note}</p>
              </div>
            ))}
            <FeatureList items={PRO} />
            {CYCLES.map((cycle) => (
              <Link
                key={cycle.value}
                data-cycle={cycle.value}
                className="landing-button landing-button-primary plan-cta"
                href={`/signup?plan=pro&cycle=${cycle.value}`}
              >
                {cycle.cta}
              </Link>
            ))}
          </article>
          <article className="landing-plan landing-plan-free" aria-labelledby="free-title">
            <div className="plan-head">
              <h3 id="free-title">Cozya Free</h3>
            </div>
            <div className="plan-cycle-price">
              <p className="plan-price">R$ 0</p>
              <p className="plan-billing-note">
                É onde a conta fica se você não assinar depois do teste.
              </p>
            </div>
            <FeatureList items={FREE} />
            <Link href="/signup" className="landing-button landing-button-outline plan-cta">
              Começar grátis <ArrowRight size={18} aria-hidden />
            </Link>
          </article>
        </div>
        <p className="pricing-credit-note">
          Ditar uma busca também usa 1 crédito, e se a IA não conseguir, o crédito volta. Escrever
          do seu jeito, planejar, montar a lista e cozinhar não usam créditos.
        </p>
      </div>
    </section>
  );
}
