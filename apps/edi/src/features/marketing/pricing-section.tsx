"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState } from "react";
import { SuiteBars } from "../../components/site/brand";
import { CheckIcon, MinusIcon } from "../../components/site/icons";
import type { SuitePlan, suitePricing } from "../billing/pricing";

type Pricing = ReturnType<typeof suitePricing>;

export function PricingToggle({
  plan,
  onChange,
  freeMonths,
}: {
  plan: SuitePlan;
  onChange: (plan: SuitePlan) => void;
  freeMonths: number;
}) {
  const hydrated = useHydrated();
  return (
    <fieldset className="billing-toggle">
      <legend className="visually-hidden">Forma de pagamento</legend>
      <button
        type="button"
        aria-pressed={plan === "mensal"}
        disabled={!hydrated}
        onClick={() => onChange("mensal")}
      >
        Mensal
      </button>
      <button
        type="button"
        aria-pressed={plan === "anual"}
        disabled={!hydrated}
        onClick={() => onChange("anual")}
      >
        Anual · {freeMonths} meses por nossa conta
      </button>
    </fieldset>
  );
}

export function PricingSection({
  pricing,
  billingOpen,
  deviceLimit,
  offlineHours,
  children,
}: {
  pricing: Pricing;
  billingOpen: boolean;
  /** Limites do contrato desktop, lidos no servidor. */
  deviceLimit: number;
  offlineHours: number;
  children: React.ReactNode;
}) {
  const [plan, setPlan] = useState<SuitePlan>("mensal");
  const annual = plan === "anual";
  return (
    <div className="pricing">
      <div className="pricing__intro">
        {children}
        <PricingToggle plan={plan} onChange={setPlan} freeMonths={pricing.annual.freeMonths} />
      </div>
      <div className="price-card">
        <div className="price-card__head">
          <h3 className="display-4">Suíte Edi</h3>
          <SuiteBars />
        </div>
        <p className="price" aria-live="polite">
          <span className="price__value">
            {annual ? pricing.annual.price : pricing.monthly.price}
          </span>
          <span className="price__unit">{annual ? "por ano" : "por mês"}</span>
        </p>
        <p className="muted small">
          {annual
            ? `Sai por ${pricing.annual.perMonth} ao mês. Você paga ${pricing.annual.paidMonths} meses e usa 12, uma economia de ${pricing.annual.savings}.`
            : "Cobrança mensal no cartão. Cancele quando quiser."}
        </p>
        <ul className="check-list">
          <li>
            <CheckIcon size={18} />
            EdiAula, EdiCaptura, EdiFoto, EdiPDF e EdiSVG
          </li>
          <li>
            <CheckIcon size={18} />
            Até {deviceLimit} computadores com Windows
          </li>
          <li>
            <CheckIcon size={18} />
            Todas as atualizações enquanto a assinatura estiver ativa
          </li>
          <li>
            <CheckIcon size={18} />
            Uso sem internet por até {offlineHours} horas
          </li>
          <li className="check-list__excluded">
            <MinusIcon size={18} />
            Consumo de IA não incluso: use a sua conta
          </li>
        </ul>
        {billingOpen ? (
          <>
            <Link
              className="button button--primary button--lg button--block"
              href={annual ? "/conta?plano=anual" : "/conta?plano=mensal"}
            >
              Assinar a Suíte Edi
            </Link>
            <p className="price-card__note">
              Pagamento seguro pela Stripe. Cancelamento pela sua conta, a qualquer momento.
            </p>
          </>
        ) : (
          <>
            <Link
              className="button button--primary button--lg button--block"
              href="/entrar?criar=1"
            >
              Criar minha conta
            </Link>
            <p className="price-card__note">
              As assinaturas abrem ao fim da homologação. Nenhuma cobrança é feita antes disso.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
