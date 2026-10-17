import { LunchboxIcon } from "@/components/brand/lunchbox-icon";

/** One example week, told by the moments where the app helps. */
export function WeekStory() {
  return (
    <section className="story-section" aria-labelledby="story-title">
      <div className="landing-shell">
        <div className="story-heading">
          <p className="landing-eyebrow">Uma semana com o Cozya</p>
          <h2 className="landing-title" id="story-title">
            Decide uma vez. A semana segue sozinha.
          </h2>
        </div>
        <ol className="story-grid">
          <li className="story-card">
            <span className="story-when">Domingo à noite</span>
            <h3>Você escolhe os jantares.</h3>
            <div className="story-note">
              <p>
                <b>Seg</b> · Frango assado
              </p>
              <p>
                <b>Ter</b> · Strogonoff
              </p>
              <p>
                <b>Qua</b> · Omelete de abobrinha
              </p>
              <p>
                <b>Qui</b> · Macarrão com grão-de-bico
              </p>
            </div>
          </li>
          <li className="story-card">
            <span className="story-when">Segunda, no mercado</span>
            <h3>A lista já vem somada.</h3>
            <div className="story-note">
              <p className="story-row">
                <span>Alho</span>
                <b>9 dentes</b>
              </p>
              <p className="story-row">
                <span>Ovos</span>
                <b>8</b>
              </p>
              <p className="story-row">
                <span>Sobrecoxa</span>
                <b>1 kg</b>
              </p>
              <p className="story-muted">Na despensa: sal, azeite, louro</p>
            </div>
          </li>
          <li className="story-card">
            <span className="story-when">Terça, 19h</span>
            <h3>Hoje tem strogonoff.</h3>
            <div className="story-note">
              <p className="story-step">Passo 3 de 4</p>
              <p>Volte o frango, junte o champignon e o ketchup e cozinhe por 10 minutos.</p>
              <p className="story-timer">Marcar 10 minutos</p>
            </div>
          </li>
          <li className="story-card">
            <span className="story-when">Quarta, no almoço</span>
            <h3>A marmita já estava separada.</h3>
            <div className="story-note">
              <p className="tag-peach">
                <LunchboxIcon width={14} height={14} /> Marmita do strogonoff
              </p>
              <p>Separada ontem, com as porções que você pediu.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
