import { TrialCta } from "../trial-cta";

export function FinalCta() {
  return (
    <section className="landing-shell final-cta-section" aria-labelledby="final-title">
      <div className="final-cta">
        <p className="landing-eyebrow">Sua semana à mesa</p>
        <h2 id="final-title">Comece com três jantares.</h2>
        <p>Escolha três receitas, coloque nos dias e leve a lista com você.</p>
        <TrialCta tone="navy" />
      </div>
    </section>
  );
}
