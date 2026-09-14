"use client";
import { useState } from "react";
import { ANNUAL_SAVINGS_PCT, type BillingCycle, PRICING } from "@/features/billing/plans-content";
import styles from "../sales.module.css";
import { SalesCta } from "../sales-cta";

const FREE_BENEFITS = [
  "1 criança e até 20 pendências próprias",
  "5 importações por conta verificada, concedidas uma vez",
  "Rotina, calendário e histórico",
  "Receba atividades compartilhadas pela turma",
];
const PRO_BENEFITS = [
  "Até 3 crianças e 2 adultos com logins próprios",
  "Providências sem o limite de 20 pendências",
  "70 créditos/mês: 1 por recado de texto, foto ou PDF",
  "Resumo por e-mail e lembretes configuráveis",
  "Responsáveis por criança e repetição semanal",
  "Compartilhamento com a turma e calendário pessoal",
];
export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const price = PRICING[cycle];
  return (
    <section
      id="planos"
      className={[styles.section, styles.pricingSection].join(" ")}
      aria-labelledby="pricing-title"
    >
      <div className={styles.wrap}>
        <div className={styles.pricingHead}>
          <p className={styles.eyebrow}>Um primeiro recado. Uma rotina mais leve.</p>
          <h2 id="pricing-title">
            Comece com um recado.
            <br />
            Continue com a rotina.
          </h2>
          <p>
            Experimente o resultado sem cartão. Escolha o Pro quando quiser acompanhar e dividir os
            cuidados.
          </p>
        </div>
        <fieldset className={styles.cycle} aria-label="Ciclo de cobrança do Pro">
          <button
            type="button"
            aria-pressed={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
          >
            Mensal
          </button>
          <button
            type="button"
            aria-pressed={cycle === "annual"}
            onClick={() => setCycle("annual")}
          >
            Anual <span>economize ~{ANNUAL_SAVINGS_PCT}%</span>
          </button>
        </fieldset>
        <div className={styles.priceGrid}>
          <div className={styles.priceCard}>
            <h3 className={styles.planName}>Gratuito</h3>
            <p className={styles.intro}>Para organizar os primeiros recados.</p>
            <p className={styles.price}>R$ 0</p>
            <p className={styles.billingNote}>Sem cartão. Comece no seu ritmo.</p>
            <ul>
              {FREE_BENEFITS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <SalesCta placement="pricing" secondary />
            <p className={styles.fine}>As cinco importações não renovam todo mês.</p>
          </div>
          <div className={[styles.priceCard, styles.proCard].join(" ")}>
            <h3 className={styles.planName}>
              Pro <span className={[styles.pill, styles.blue].join(" ")}>PARA A FAMÍLIA</span>
            </h3>
            <p className={styles.intro}>Para acompanhar a rotina ao longo do mês.</p>
            <div aria-live="polite" aria-atomic="true">
              <p className={styles.price}>
                {price.price}
                <small>{price.period}</small>
              </p>
              <p className={styles.billingNote}>{price.note}</p>
            </div>
            <ul>
              {PRO_BENEFITS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <SalesCta placement="pricing" cycle={cycle} />
            <p className={styles.fine}>
              Cancele a renovação quando quiser. Push depende de compatibilidade e permissão do
              dispositivo.
            </p>
          </div>
        </div>
        <p className={styles.pricingUnder}>
          Uma importação pode gerar várias atividades. Cadastro por voz usa 2 créditos. O Pro também
          inclui exportação da agenda em PDF.
        </p>
      </div>
    </section>
  );
}
